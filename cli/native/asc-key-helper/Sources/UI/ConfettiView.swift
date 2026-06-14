import SwiftUI

/// Dependency-free confetti burst for the success screen. A `Canvas` particle
/// system: N pieces launch upward + outward from the top-centre, fall under
/// gravity while spinning, and fade out. The burst approach is adapted from the
/// popular ConfettiSwiftUI (MIT, © Simon Bachmann,
/// https://github.com/simibac/ConfettiSwiftUI) — reimplemented here with Canvas
/// so the helper keeps ZERO external dependencies (see THIRD-PARTY-LICENSES.md).
struct ConfettiView: View {
    private struct Piece {
        let vx: Double      // initial horizontal velocity (pt/s)
        let vy: Double      // initial vertical velocity (pt/s; negative = up)
        let color: Color
        let size: Double
        let spin: Double    // radians/s
        let isCircle: Bool
        let delay: Double   // launch delay (s) — staggers the burst
    }

    private let pieces: [Piece]
    private let gravity = 1100.0
    private let lifetime = 3.4
    /// Captured when the view first appears; drives elapsed time in the Canvas.
    @State private var start = Date()

    init(count: Int = 110) {
        let palette: [Color] = [.pink, .purple, .blue, .green, .yellow, .orange, .red, .mint, .cyan, .indigo]
        var made: [Piece] = []
        for _ in 0 ..< count {
            // Launch up-and-out: angles in the upper half, varied speed.
            let angle = Double.random(in: -Double.pi * 0.92 ... -Double.pi * 0.08)
            let speed = Double.random(in: 340 ... 820)
            made.append(Piece(
                vx: cos(angle) * speed,
                vy: sin(angle) * speed,
                color: palette.randomElement() ?? .pink,
                size: Double.random(in: 6 ... 12),
                spin: Double.random(in: -9 ... 9),
                isCircle: Bool.random(),
                delay: Double.random(in: 0 ... 0.45)
            ))
        }
        pieces = made
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let elapsed = timeline.date.timeIntervalSince(start)
                let originX = size.width / 2
                let originY = size.height * 0.16
                for piece in pieces {
                    let t = elapsed - piece.delay
                    if t < 0 { continue }
                    let progress = t / lifetime
                    if progress >= 1 { continue }
                    let x = originX + piece.vx * t
                    let y = originY + piece.vy * t + 0.5 * gravity * t * t
                    if y > size.height + 24 { continue }

                    var layer = context
                    layer.opacity = max(0, 1 - progress * progress) // ease-out fade
                    layer.translateBy(x: x, y: y)
                    layer.rotate(by: .radians(piece.spin * t))
                    // Slightly oblong rectangles read more like real confetti.
                    let rect = CGRect(
                        x: -piece.size / 2,
                        y: -piece.size / 2,
                        width: piece.size,
                        height: piece.size * (piece.isCircle ? 1 : 0.6)
                    )
                    let path = piece.isCircle ? Path(ellipseIn: rect) : Path(rect)
                    layer.fill(path, with: .color(piece.color))
                }
            }
        }
        .allowsHitTesting(false)
    }
}
