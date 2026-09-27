// Renders editable scenario and sampling controls alongside validation feedback.
import SwiftUI
import TransitCore

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
      if session.isDetachedBinaryLab {
        Section("Detached-binary lab") {
          Text(
            "Education preview. These controls affect only the portable primary-star photometry model."
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
          if session.isParameterEditingLocked {
            Label(
              "Choose a hypothesis in the lab before parameter controls unlock.",
              systemImage: "lock.fill"
            )
            .accessibilityIdentifier("binary-lab-parameters-locked")
          } else {
            Label("Parameter controls unlocked by your hypothesis.", systemImage: "lock.open")
              .foregroundStyle(.secondary)
          }
        }
        if !session.isParameterEditingLocked {
          Section("Primary-star photometry") {
            draftField(
              "Disk resolution", text: $session.draftGridResolution,
              error: session.draftValidationErrors[.gridResolution], identifier: "grid-resolution")
            draftField(
              "Primary limb darkening u1", text: $session.draftLimbDarkeningU1,
              error: session.draftValidationErrors[.limbDarkeningU1],
              identifier: "binary-primary-limb-darkening-u1")
            draftField(
              "Primary limb darkening u2", text: $session.draftLimbDarkeningU2,
              error: session.draftValidationErrors[.limbDarkeningU2],
              identifier: "binary-primary-limb-darkening-u2")
            HStack {
              Button("Apply controls") { session.applyDraft() }
                .keyboardShortcut(.return, modifiers: [.command])
              Button("Revert") { session.resetDraft() }
            }
          }
        }
      } else {
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
            Button("Apply") { session.applyDraft() }.keyboardShortcut(
              .return, modifiers: [.command])
            Button("Revert") { session.resetDraft() }
          }
        }
        if session.interfaceTier == .advanced {
          Section("Photometry") {
            draftField(
              "Disk resolution", text: $session.draftGridResolution,
              error: session.draftValidationErrors[.gridResolution], identifier: "grid-resolution")
            Text("Higher resolution improves limb coverage but increases calculation cost.")
              .font(.footnote)
              .foregroundStyle(.secondary)
            draftField(
              "Limb darkening u1", text: $session.draftLimbDarkeningU1,
              error: session.draftValidationErrors[.limbDarkeningU1],
              identifier: "limb-darkening-u1")
            draftField(
              "Limb darkening u2", text: $session.draftLimbDarkeningU2,
              error: session.draftValidationErrors[.limbDarkeningU2],
              identifier: "limb-darkening-u2")
          }
          phaseCurveControls(
            title: "Planet phase curve", enabled: $session.draftPlanetPhaseEnabled,
            reflectedAmplitude: $session.draftPlanetPhaseReflectedAmplitude,
            thermalAmplitude: $session.draftPlanetPhaseThermalAmplitude,
            constantFlux: $session.draftPlanetPhaseConstantFlux,
            reflectedOffset: $session.draftPlanetPhaseReflectedOffsetRadians,
            thermalOffset: $session.draftPlanetPhaseThermalOffsetRadians,
            reflectedModel: $session.draftPlanetPhaseReflectedModel,
            thermalModel: $session.draftPlanetPhaseThermalModel,
            errors: session.draftValidationErrors, prefix: "planet-phase")
          if session.scenario.moon != nil {
            phaseCurveControls(
              title: "Moon phase curve", enabled: $session.draftMoonPhaseEnabled,
              reflectedAmplitude: $session.draftMoonPhaseReflectedAmplitude,
              thermalAmplitude: $session.draftMoonPhaseThermalAmplitude,
              constantFlux: $session.draftMoonPhaseConstantFlux,
              reflectedOffset: $session.draftMoonPhaseReflectedOffsetRadians,
              thermalOffset: $session.draftMoonPhaseThermalOffsetRadians,
              reflectedModel: $session.draftMoonPhaseReflectedModel,
              thermalModel: $session.draftMoonPhaseThermalModel,
              errors: session.draftValidationErrors, prefix: "moon-phase")
          }
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
            Picker(
              "Runtime",
              selection: Binding(
                get: { session.runtimeMode },
                set: { session.setRuntimeMode($0) })
            ) {
              ForEach(NativeRuntimeMode.allCases, id: \.self) { mode in
                Text(mode.title).tag(mode)
              }
            }
            .pickerStyle(.segmented)
            Text(
              session.runtimeMode == .reference
                ? "Reference mode is available and averages \(session.referenceSubsteps) deterministic snapshots over each V4 observation window."
                : "Interactive mode evaluates the current observation time directly."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
          }
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

  /// Renders phase controls only while their V4 curve is enabled, keeping advanced drafts legible.
  @ViewBuilder
  private func phaseCurveControls(
    title: String, enabled: Binding<Bool>, reflectedAmplitude: Binding<String>,
    thermalAmplitude: Binding<String>, constantFlux: Binding<String>,
    reflectedOffset: Binding<String>,
    thermalOffset: Binding<String>, reflectedModel: Binding<PhaseCurve.ReflectedModel>,
    thermalModel: Binding<PhaseCurve.ThermalModel>, errors: [EducationSession.DraftField: String],
    prefix: String
  ) -> some View {
    Section(title) {
      Toggle("Enabled", isOn: enabled).accessibilityIdentifier("\(prefix)-enabled")
      if enabled.wrappedValue {
        draftField(
          "Reflected amplitude", text: reflectedAmplitude,
          error: errors[
            prefix == "planet-phase" ? .planetPhaseReflectedAmplitude : .moonPhaseReflectedAmplitude
          ],
          identifier: "\(prefix)-reflected-amplitude")
        draftField(
          "Thermal amplitude", text: thermalAmplitude,
          error: errors[
            prefix == "planet-phase" ? .planetPhaseThermalAmplitude : .moonPhaseThermalAmplitude],
          identifier: "\(prefix)-thermal-amplitude")
        draftField(
          "Constant flux", text: constantFlux,
          error: errors[
            prefix == "planet-phase" ? .planetPhaseConstantFlux : .moonPhaseConstantFlux],
          identifier: "\(prefix)-constant-flux")
        Picker("Reflected model", selection: reflectedModel) {
          Text("Lambert").tag(PhaseCurve.ReflectedModel.lambert)
          Text("Cosine").tag(PhaseCurve.ReflectedModel.cosine)
        }
        Picker("Thermal model", selection: thermalModel) {
          ForEach(PhaseCurve.ThermalModel.allCases, id: \.self) { model in
            Text(model.rawValue.capitalized).tag(model)
          }
        }
        DisclosureGroup("Phase offsets") {
          draftField(
            "Reflected offset (rad)", text: reflectedOffset,
            error: errors[
              prefix == "planet-phase" ? .planetPhaseReflectedOffset : .moonPhaseReflectedOffset],
            identifier: "\(prefix)-reflected-offset")
          draftField(
            "Thermal offset (rad)", text: thermalOffset,
            error: errors[
              prefix == "planet-phase" ? .planetPhaseThermalOffset : .moonPhaseThermalOffset],
            identifier: "\(prefix)-thermal-offset")
        }
      }
    }
  }
}
