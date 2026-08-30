// Renders editable scenario and sampling controls alongside validation feedback.
import SwiftUI

/// Presents scenario controls and validation feedback without exposing raw model internals.
struct ParameterInspector: View {
  let session: EducationSession

  /// Builds the grouped inspector form bound directly to the session draft state.
  var body: some View {
    @Bindable var session = session
    Form {
      Section("Interface") {
        Picker(
          "Control set",
          selection: Binding(
            get: { session.interfaceTier },
            set: { session.setInterfaceTier($0) })
        ) {
          ForEach(InterfaceTier.allCases, id: \.self) { tier in
            Text(tier.title).tag(tier)
          }
        }
        .pickerStyle(.segmented)
      }
      Section("Transit") {
        draftField(
          "Planet radius (m)", text: $session.draftPlanetRadiusMetres,
          error: session.draftValidationErrors[.planetRadius], identifier: "planet-radius")
        if session.scenario.moon != nil {
          draftField(
            "Moon radius (m)", text: $session.draftMoonRadiusMetres,
            error: session.draftValidationErrors[.moonRadius], identifier: "moon-radius")
          if session.interfaceTier == .advanced {
            draftField(
              "Moon phase (rad)", text: $session.draftMoonPhaseRadians,
              error: session.draftValidationErrors[.moonPhase], identifier: "moon-phase")
          }
        }
        HStack {
          Button("Apply") { session.applyDraft() }.keyboardShortcut(.return, modifiers: [.command])
          Button("Revert") { session.resetDraft() }
        }
      }
      if session.interfaceTier == .advanced {
        Section("Sampling") {
          Stepper(
            "Samples: \(session.sampleCount)",
            value: Binding(
              get: { session.sampleCount },
              set: { session.setSampleCount($0) }),
            in: 32...512, step: 16)
        }
        Section("Sky view") {
          Slider(
            value: Binding(
              get: { session.sceneZoom },
              set: { session.setSceneZoom($0) }),
            in: 0.5...4, step: 0.25
          ) {
            Text("Manual zoom")
          } minimumValueLabel: {
            Text("0.5x")
          } maximumValueLabel: {
            Text("4x")
          }
          Text("Zoom: \(session.sceneZoom, format: .number.precision(.fractionLength(2)))x")
            .font(.caption)
          Button("Reset zoom") { session.resetSceneZoom() }
        }
        Section("Calculation mode") {
          LabeledContent("Runtime", value: NativeRuntimeMode.interactive.title)
          Text("Deterministic reference execution is not available in the native app yet.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
      Section {
        Text(
          session.isOccluded
            ? "Presentation and playback are paused while this window is occluded; any in-flight calculation is discarded when it returns."
            : "Apply validates drafts; the latest valid frame remains visible if a calculation fails."
        )
        .font(.footnote)
        .foregroundStyle(.secondary)
      }
    }
    .formStyle(.grouped)
    .padding()
    .frame(minWidth: 260)
  }

  /// Creates one editable draft field and its localized validation message.
  @ViewBuilder
  private func draftField(
    _ title: String, text: Binding<String>, error: String?, identifier: String
  ) -> some View {
    TextField(title, text: text)
      .accessibilityIdentifier(identifier)
    if let error {
      Text(error)
        .font(.footnote)
        .foregroundStyle(.red)
        .accessibilityIdentifier("\(identifier)-error")
    }
  }
}
