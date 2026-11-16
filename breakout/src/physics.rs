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
    penetration: f32,
}

// Outside the box the shortest escape is radial from its closest point.
// Inside, choose the nearest expanded face; exact ties prefer Bottom, Top,
// Left, Right, independent of velocity and entity iteration order.
fn overlap(position: Vec2, radius: f32, half: Vec2) -> Option<Contact> {
    let offset = position - position.clamp(-half, half);
    let distance = offset.length();
    if distance > radius {
        return None;
    }
    if distance > 0. {
        return Some(Contact {
            time: 0.,
            normal: offset / distance,
            penetration: radius - distance,
        });
    }
    let candidates = [
        (Vec2::NEG_Y, half.y + position.y + radius),
        (Vec2::Y, half.y - position.y + radius),
        (Vec2::NEG_X, half.x + position.x + radius),
        (Vec2::X, half.x - position.x + radius),
    ];
    let mut nearest = candidates[0];
    for candidate in candidates.into_iter().skip(1) {
        if candidate.1 < nearest.1 {
            nearest = candidate;
        }
    }
    Some(Contact {
        time: 0.,
        normal: nearest.0,
        penetration: nearest.1,
    })
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
    if let Some(contact) = overlap(position, radius, half) {
        // Recovery is meaningful once. Exact resting/tangent wall contacts are
        // geometrically valid but do not start another impact on every tick.
        if include_resting || contact.penetration > 0. || velocity.dot(contact.normal) < 0. {
            return Some(contact);
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
            first = Some(Contact {
                time,
                normal,
                penetration: 0.,
            });
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
    for _ in 0..MAX_CONTACT_PASSES {
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
                obstacle.brick,
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
                .then(obstacles[*a].center.x.total_cmp(&obstacles[*b].center.x))
                .then(obstacles[*a].center.y.total_cmp(&obstacles[*b].center.y))
                .then(
                    obstacles[*a]
                        .half_size
                        .x
                        .total_cmp(&obstacles[*b].half_size.x),
                )
                .then(
                    obstacles[*a]
                        .half_size
                        .y
                        .total_cmp(&obstacles[*b].half_size.y),
                )
        });
        let incoming = *velocity;
        for (index, contact) in contacts {
            let obstacle = &obstacles[index];
            // Earlier simultaneous corrections may already have cleared this
            // overlap, so recompute the minimum displacement at the impact pose.
            if let Some(penetration) = overlap(
                *position - obstacle.center - obstacle.velocity * elapsed,
                radius,
                obstacle.half_size,
            ) {
                if penetration.penetration > 0. {
                    *position += penetration.normal * (penetration.penetration + CONTACT_TOLERANCE);
                }
            }
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
    fn zero_duration_recovery_uses_minimum_displacement_and_explicit_face_ties() {
        let center = Vec2::new(32., -16.);
        let obstacles = [Obstacle {
            entity: Entity::from_raw(0),
            center,
            half_size: Vec2::splat(3.),
            velocity: Vec2::ZERO,
            brick: false,
        }];
        for (offset, expected) in [
            (Vec2::ZERO, Vec2::new(0., -5.)),
            (Vec2::new(2., 2.), Vec2::new(2., 5.)),
            (Vec2::new(-2., 2.), Vec2::new(-2., 5.)),
            (Vec2::new(2., -2.), Vec2::new(2., -5.)),
            (Vec2::new(2.5, 0.), Vec2::new(5., 0.)),
            (Vec2::new(-2.5, 0.), Vec2::new(-5., 0.)),
        ] {
            let mut position = center + offset;
            let mut velocity = Vec2::ZERO;
            assert_eq!(
                advance_ball(&mut position, &mut velocity, 2., 0., &obstacles).len(),
                1
            );
            assert!(
                (position - center - expected).length() < 0.0002,
                "{position:?}"
            );
            assert!(advance_ball(&mut position, &mut velocity, 2., 0., &obstacles).is_empty());
            assert_eq!(velocity, Vec2::ZERO);
        }
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
