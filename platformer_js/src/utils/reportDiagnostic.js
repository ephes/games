export function reportDiagnostic(report) {
  try {
    report();
  } catch {
    // A diagnostic sink can fail independently of the operation it reports.
  }
}
