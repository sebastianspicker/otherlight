// Implements recoverable draft editing for EducationSession.
import Foundation
import TransitCore

/// Provides validated draft editing and reset operations for an education session.
extension EducationSession {
  /// Validates draft text without replacing invalid input or accepted simulation state.
  func applyDraft() {
    if isDetachedBinaryLab {
      applyDetachedBinaryDraft()
      return
    }
    draftValidationErrors = [:]
    guard let planet = parseDraft(draftPlanetRadiusMetres, field: .planetRadius) else {
      return presentDraftErrors()
    }
    guard let gridResolution = parseGridResolution() else { return presentDraftErrors() }
    guard let limbDarkeningU1 = parseDraft(draftLimbDarkeningU1, field: .limbDarkeningU1),
      let limbDarkeningU2 = parseDraft(draftLimbDarkeningU2, field: .limbDarkeningU2)
    else { return presentDraftErrors() }
    let planetPhase = parsePhaseDraft(
      existing: scenario.planetPhase, enabled: draftPlanetPhaseEnabled,
      reflectedAmplitude: draftPlanetPhaseReflectedAmplitude,
      thermalAmplitude: draftPlanetPhaseThermalAmplitude,
      constantFlux: draftPlanetPhaseConstantFlux,
      reflectedOffsetRadians: draftPlanetPhaseReflectedOffsetRadians,
      thermalOffsetRadians: draftPlanetPhaseThermalOffsetRadians,
      reflectedModel: draftPlanetPhaseReflectedModel, thermalModel: draftPlanetPhaseThermalModel,
      fieldPrefix: .planetPhaseReflectedAmplitude)
    guard planetPhase.isValid else { return presentDraftErrors() }
    var candidate = scenario
    candidate.planet.radiusMetres = planet
    candidate.gridResolution = gridResolution
    candidate.star.limbDarkeningU1 = limbDarkeningU1
    candidate.star.limbDarkeningU2 = limbDarkeningU2
    candidate.planetPhase = planetPhase.curve
    if var moon = candidate.moon {
      guard let moonRadius = parseDraft(draftMoonRadiusMetres, field: .moonRadius),
        let phase = parseDraft(draftMoonPhaseRadians, field: .moonPhase)
      else { return presentDraftErrors() }
      let moonPhase = parsePhaseDraft(
        existing: scenario.moonPhase, enabled: draftMoonPhaseEnabled,
        reflectedAmplitude: draftMoonPhaseReflectedAmplitude,
        thermalAmplitude: draftMoonPhaseThermalAmplitude, constantFlux: draftMoonPhaseConstantFlux,
        reflectedOffsetRadians: draftMoonPhaseReflectedOffsetRadians,
        thermalOffsetRadians: draftMoonPhaseThermalOffsetRadians,
        reflectedModel: draftMoonPhaseReflectedModel, thermalModel: draftMoonPhaseThermalModel,
        fieldPrefix: .moonPhaseReflectedAmplitude)
      guard moonPhase.isValid else { return presentDraftErrors() }
      moon.radiusMetres = moonRadius
      moon.orbit.meanAnomalyAtEpochRadians = phase
      candidate.moon = moon
      candidate.moonPhase = moonPhase.curve
    }
    applyValidatedDraft(candidate)
  }

  /// Restores editable draft text from the accepted scenario and clears field errors.
  func resetDraft() {
    applyDraftValues(EducationDraftPolicy.values(for: scenario))
    draftValidationErrors = [:]
    displayState = frame == nil ? .empty : .ready
  }

  /// Assigns every editable draft value from an accepted scenario during a deliberate reset.
  private func applyDraftValues(_ draft: EducationDraftPolicy.Values) {
    applySystemDraftValues(draft)
    applyPlanetPhaseDraftValues(draft.planetPhase)
    applyMoonPhaseDraftValues(draft.moonPhase)
  }

  /// Copies the accepted system-level values into editable draft fields.
  private func applySystemDraftValues(_ draft: EducationDraftPolicy.Values) {
    draftPlanetRadiusMetres = draft.planet
    draftMoonRadiusMetres = draft.moon
    draftMoonPhaseRadians = draft.phase
    draftGridResolution = draft.gridResolution
    draftLimbDarkeningU1 = draft.limbDarkeningU1
    draftLimbDarkeningU2 = draft.limbDarkeningU2
  }

  /// Copies accepted planet phase values into editable draft fields.
  private func applyPlanetPhaseDraftValues(_ draft: EducationDraftPolicy.PhaseValues) {
    draftPlanetPhaseEnabled = draft.enabled
    draftPlanetPhaseReflectedAmplitude = draft.reflectedAmplitude
    draftPlanetPhaseThermalAmplitude = draft.thermalAmplitude
    draftPlanetPhaseConstantFlux = draft.constantFlux
    draftPlanetPhaseReflectedOffsetRadians = draft.reflectedOffsetRadians
    draftPlanetPhaseThermalOffsetRadians = draft.thermalOffsetRadians
    draftPlanetPhaseReflectedModel = draft.reflectedModel
    draftPlanetPhaseThermalModel = draft.thermalModel
  }

  /// Copies accepted moon phase values into editable draft fields.
  private func applyMoonPhaseDraftValues(_ draft: EducationDraftPolicy.PhaseValues) {
    draftMoonPhaseEnabled = draft.enabled
    draftMoonPhaseReflectedAmplitude = draft.reflectedAmplitude
    draftMoonPhaseThermalAmplitude = draft.thermalAmplitude
    draftMoonPhaseConstantFlux = draft.constantFlux
    draftMoonPhaseReflectedOffsetRadians = draft.reflectedOffsetRadians
    draftMoonPhaseThermalOffsetRadians = draft.thermalOffsetRadians
    draftMoonPhaseReflectedModel = draft.reflectedModel
    draftMoonPhaseThermalModel = draft.thermalModel
  }

  /// Applies only the supported primary-star photometry controls once the binary-lab gate unlocks.
  private func applyDetachedBinaryDraft() {
    guard !isParameterEditingLocked else {
      calculationStatus = "Choose a binary-lab hypothesis before editing parameters."
      return
    }
    draftValidationErrors = [:]
    guard let gridResolution = parseGridResolution(),
      let limbDarkeningU1 = parseDraft(draftLimbDarkeningU1, field: .limbDarkeningU1),
      let limbDarkeningU2 = parseDraft(draftLimbDarkeningU2, field: .limbDarkeningU2),
      var binary = scenario.detachedBinary
    else { return presentDraftErrors() }
    var candidate = scenario
    binary.primary.star.limbDarkeningU1 = limbDarkeningU1
    binary.primary.star.limbDarkeningU2 = limbDarkeningU2
    candidate.star = binary.primary.star
    candidate.detachedBinary = binary
    candidate.gridResolution = gridResolution
    applyValidatedDraft(candidate)
  }

  /// Validates a fully parsed candidate before it replaces accepted state.
  private func applyValidatedDraft(_ candidate: EducationScenarioV4) {
    let issues = SimulationEngine.validate(candidate)
    guard issues.isEmpty else {
      displayState = .error(ValidationError(issues).localizedDescription)
      calculationStatus = "Parameters need attention"
      for field in DraftField.allCases {
        draftValidationErrors[field] = ValidationError(issues).localizedDescription
      }
      return
    }
    if scenario != candidate { resetHistories() }
    scenario = candidate
    requestCalculation(refreshSeries: true)
  }

  /// Parses finite user text while attaching a field-specific recovery error on failure.
  private func parseDraft(_ text: String, field: DraftField) -> Double? {
    guard let value = EducationDraftPolicy.finiteNumber(from: text) else {
      draftValidationErrors[field] = "Enter a finite number."
      return nil
    }
    return value
  }

  /// Requires an integral disk resolution while retaining malformed draft text for correction.
  private func parseGridResolution() -> Int? {
    guard let value = parseDraft(draftGridResolution, field: .gridResolution) else { return nil }
    guard value.rounded() == value, value >= 1, value <= 1_024 else {
      draftValidationErrors[.gridResolution] = "Enter a whole number from 1 to 1024."
      return nil
    }
    return Int(value)
  }

  /// Parses one phase curve without constructing a disabled curve that was absent from the scenario.
  private func parsePhaseDraft(
    existing: PhaseCurve?, enabled: Bool, reflectedAmplitude: String, thermalAmplitude: String,
    constantFlux: String, reflectedOffsetRadians: String, thermalOffsetRadians: String,
    reflectedModel: PhaseCurve.ReflectedModel, thermalModel: PhaseCurve.ThermalModel,
    fieldPrefix: DraftField
  ) -> (isValid: Bool, curve: PhaseCurve?) {
    guard let reflected = parseDraft(reflectedAmplitude, field: fieldPrefix),
      let thermal = parseDraft(
        thermalAmplitude,
        field: fieldPrefix == .planetPhaseReflectedAmplitude
          ? .planetPhaseThermalAmplitude : .moonPhaseThermalAmplitude),
      let constant = parseDraft(
        constantFlux,
        field: fieldPrefix == .planetPhaseReflectedAmplitude
          ? .planetPhaseConstantFlux : .moonPhaseConstantFlux),
      let reflectedOffset = parseDraft(
        reflectedOffsetRadians,
        field: fieldPrefix == .planetPhaseReflectedAmplitude
          ? .planetPhaseReflectedOffset : .moonPhaseReflectedOffset),
      let thermalOffset = parseDraft(
        thermalOffsetRadians,
        field: fieldPrefix == .planetPhaseReflectedAmplitude
          ? .planetPhaseThermalOffset : .moonPhaseThermalOffset)
    else { return (false, nil) }
    guard existing != nil || enabled else { return (true, nil) }
    return (
      true,
      .init(
        enabled: enabled, reflectedAmplitude: reflected, thermalAmplitude: thermal,
        lambertian: reflectedModel == .lambert, reflectedOffsetRadians: reflectedOffset,
        thermalOffsetRadians: thermalOffset, constantFlux: constant, reflectedModel: reflectedModel,
        thermalModel: thermalModel, clampsWeights: existing?.clampsWeights ?? true,
        usesPhysicalScaling: existing?.usesPhysicalScaling ?? false)
    )
  }

  /// Presents a non-destructive validation failure while retaining draft text and frame.
  private func presentDraftErrors() {
    displayState = .error("Correct the highlighted parameters before applying them.")
    calculationStatus = "Parameters need attention"
  }
}
