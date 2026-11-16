//! Headless swept circle/AABB simulation. Collider centers are at tick start.
use bevy::prelude::*;

const MAX_CONTACT_PASSES: usize = 32;
const CONTACT_TOLERANCE: f32 = 1.0e-4;

pub(super) struct Obstacle {
    pub entity: Entity,
    pub center: Vec2,
    pub half_size: Vec2,
    pub velocity: Vec2,
    pub brick: bool,
}

#[derive(Clone, Copy)]
pub(super) struct Contact {
    time: f32,
    pub normal: Vec2,
}

// Test the four straight faces and four circular corner arcs of the expanded
// box. A ray against an expanded AABB alone would invent square corner hits.
pub(super) fn sweep_circle(
    position: Vec2,
    velocity: Vec2,
    radius: f32,
    half: Vec2,
    duration: f32,
    include_resting: bool,
) -> Option<Contact> {
    let offset = position - position.clamp(-half, half);
    if offset.length_squared() <= radius * radius {
        let normal = offset.try_normalize().unwrap_or(Vec2::NEG_Y);
        if include_resting || velocity.dot(normal) < 0.0 {
            return Some(Contact { time: 0., normal });
        }
        return None;
    }

    let mut first: Option<Contact> = None;
    let mut consider = |time: f32, normal: Vec2| {
        if time >= 0.0
            && time <= duration
            && velocity.dot(normal) < 0.0
            && first.is_none_or(|hit| time < hit.time)
        {
            first = Some(Contact { time, normal });
        }
    };
    for sign in [-1., 1.] {
        if velocity.x != 0. {
            let time = (sign * (half.x + radius) - position.x) / velocity.x;
            if (position.y + time * velocity.y).abs() <= half.y {
                consider(time, Vec2::new(sign, 0.));
            }
        }
        if velocity.y != 0. {
            let time = (sign * (half.y + radius) - position.y) / velocity.y;
            if (position.x + time * velocity.x).abs() <= half.x {
                consider(time, Vec2::new(0., sign));
            }
        }
    }
    // Use f64 for the quadratic to retain small corner roots on fast paths.
    let v = velocity.as_dvec2();
    let a = v.length_squared();
    if a > 0. {
        for sx in [-1., 1.] {
            for sy in [-1., 1.] {
                let corner = half * Vec2::new(sx, sy);
                let p = (position - corner).as_dvec2();
                let b = p.dot(v);
                let c = p.length_squared() - f64::from(radius).powi(2);
                let discriminant = b * b - a * c;
                if discriminant < 0. {
                    continue;
                }
                let time = ((-b - discriminant.sqrt()) / a) as f32;
                let offset = position + velocity * time - corner;
                if offset.x * sx >= 0. && offset.y * sy >= 0. {
                    if let Some(normal) = offset.try_normalize() {
                        consider(time, normal);
                    }
                }
            }
        }
    }
    first
}

pub(super) fn advance_ball(
    position: &mut Vec2,
    velocity: &mut Vec2,
    radius: f32,
    duration: f32,
    obstacles: &[Obstacle],
) -> Vec<Entity> {
    let mut impacts = Vec::new();
    let mut removed = Vec::new();
    let mut elapsed = 0.;
    let mut remaining = duration;
    for pass in 0..MAX_CONTACT_PASSES {
        let mut contacts = Vec::new();
        let mut earliest = remaining;
        for (index, obstacle) in obstacles.iter().enumerate() {
            if removed.contains(&index) {
                continue;
            }
            let center = obstacle.center + obstacle.velocity * elapsed;
            if let Some(contact) = sweep_circle(
                *position - center,
                *velocity - obstacle.velocity,
                radius,
                obstacle.half_size,
                remaining,
                pass == 0,
            ) {
                earliest = earliest.min(contact.time);
                contacts.push((index, contact));
            }
        }
        if contacts.is_empty() {
            *position += *velocity * remaining;
            break;
        }
        contacts.retain(|(index, hit)| {
            (hit.time - earliest).abs() * (*velocity - obstacles[*index].velocity).length().max(1.)
                <= CONTACT_TOLERANCE
        });
        *position += *velocity * earliest;
        elapsed += earliest;
        remaining = (remaining - earliest).max(0.);

        // Geometry orders simultaneous responses, never ECS traversal order.
        contacts.sort_by(|(a, x), (b, y)| {
            x.normal
                .x
                .total_cmp(&y.normal.x)
                .then(x.normal.y.total_cmp(&y.normal.y))
                .then(
                    obstacles[*a]
                        .velocity
                        .x
                        .total_cmp(&obstacles[*b].velocity.x),
                )
                .then(
                    obstacles[*a]
                        .velocity
                        .y
                        .total_cmp(&obstacles[*b].velocity.y),
                )
        });
        let incoming = *velocity;
        for (index, contact) in contacts {
            let obstacle = &obstacles[index];
            if !impacts.contains(&obstacle.entity) {
                impacts.push(obstacle.entity);
            }
            if obstacle.brick {
                removed.push(index);
            }
            // Duplicate faces reflect once; separating simultaneous faces cannot
            // reverse a response just made against another collider.
            let speed = (*velocity - obstacle.velocity).dot(contact.normal);
            if (incoming - obstacle.velocity).dot(contact.normal) < 0. && speed < 0. {
                *velocity -= 2. * speed * contact.normal;
            }
        }
        if remaining == 0. {
            break;
        }
    }
    // On pass exhaustion leave the unresolved motion unapplied rather than
    // tunnelling through an obstacle. The next fixed tick can continue safely.
    impacts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corner_sweep_uses_the_circle_arc_instead_of_a_square_expansion() {
        let hit = sweep_circle(
            Vec2::new(-4., 1.6),
            Vec2::new(4., 0.),
            1.,
            Vec2::new(2., 1.),
            1.,
            false,
        )
        .unwrap();
        assert!((hit.time - 0.3).abs() < 1.0e-6);
        assert!((hit.normal - Vec2::new(-0.8, 0.6)).length() < 1.0e-6);
        assert!(sweep_circle(
            Vec2::new(-3., 2.),
            Vec2::X,
            1.,
            Vec2::new(2., 1.),
            0.5,
            false
        )
        .is_none());
    }

    #[test]
    fn exhausting_the_contact_budget_never_applies_unchecked_motion() {
        let obstacles: Vec<_> = [-50., 50.]
            .into_iter()
            .enumerate()
            .map(|(index, x)| Obstacle {
                entity: Entity::from_raw(index as u32),
                center: Vec2::new(x, 0.),
                half_size: Vec2::new(1., 100.),
                velocity: Vec2::ZERO,
                brick: false,
            })
            .collect();
        let mut position = Vec2::ZERO;
        let mut velocity = Vec2::new(1.0e6, 0.);
        advance_ball(&mut position, &mut velocity, 15., 1., &obstacles);
        assert!(position.is_finite() && velocity.is_finite());
        assert!(position.x.abs() <= 34.001, "{position:?}");
    }
}
