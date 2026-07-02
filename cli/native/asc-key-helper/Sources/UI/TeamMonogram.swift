import SwiftUI

/// ASC has no team images — Apple's own UI draws a monogram, so we do too:
/// initials on a circle whose hue is derived deterministically from the name.
struct TeamMonogram: View {
    let name: String
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(color)
            Text(initials)
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }

    private var initials: String {
        name.split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }

    private var color: Color {
        let seed = name.unicodeScalars.reduce(UInt32(0)) { $0 &* 31 &+ $1.value }
        return Color(hue: Double(seed % 360) / 360, saturation: 0.55, brightness: 0.65)
    }
}
