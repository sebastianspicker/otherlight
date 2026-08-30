/**
 * Owns quick Controls support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderQuickControlsTemplate(): string {
  return `
        <fieldset id="quickControlsFieldset" data-ui-tier="normal expert">
          <legend>Teaching controls</legend>
          <p class="help">
            Essential controls keep the teaching surface focused. These sliders update the model and figures directly.
          </p>
          <div id="quickControlsRoot" class="quickControlsGrid">
            <label class="quickControl" data-quick-control="quickPlanetR" for="quickPlanetR">
              <span class="quickControlHeader">
                <span class="quickControlLabel">Planet size</span>
                <span id="quickPlanetRVal" class="mono quickControlValue">-</span>
              </span>
              <input id="quickPlanetR" type="range" aria-describedby="quickPlanetRHelp" />
              <span id="quickPlanetRHelp" class="help">Controls how deep the main transit dip is.</span>
            </label>

            <label class="quickControl" data-quick-control="quickPlanetInc" for="quickPlanetInc">
              <span class="quickControlHeader">
                <span class="quickControlLabel">Planet inclination</span>
                <span id="quickPlanetIncVal" class="mono quickControlValue">-</span>
              </span>
              <input id="quickPlanetInc" type="range" aria-describedby="quickPlanetIncHelp" />
              <span id="quickPlanetIncHelp" class="help">
                Changes how centrally the planet crosses the star from the viewer's line of sight.
              </span>
            </label>

            <label class="quickControl" data-quick-control="quickPlanetA" for="quickPlanetA">
              <span class="quickControlHeader">
                <span class="quickControlLabel">Planet orbit size</span>
                <span id="quickPlanetAVal" class="mono quickControlValue">-</span>
              </span>
              <input id="quickPlanetA" type="range" aria-describedby="quickPlanetAHelp" />
              <span id="quickPlanetAHelp" class="help">
                Moves the whole planet orbit while keeping its period consistent.
              </span>
            </label>

            <label class="quickControl quickControlCheckbox" data-quick-control="quickMoonEnabled" for="quickMoonEnabled">
              <span class="quickControlHeader"><span class="quickControlLabel">Show moon</span></span>
              <span class="help">Turns the moon signal on or off without opening the expert form.</span>
              <input id="quickMoonEnabled" type="checkbox" />
            </label>

            <label class="quickControl" data-quick-control="quickMoonR" for="quickMoonR">
              <span class="quickControlHeader">
                <span class="quickControlLabel">Moon size</span>
                <span id="quickMoonRVal" class="mono quickControlValue">-</span>
              </span>
              <input id="quickMoonR" type="range" aria-describedby="quickMoonRHelp" />
              <span id="quickMoonRHelp" class="help">Controls how visible the moon dip becomes.</span>
            </label>

            <label class="quickControl" data-quick-control="quickMoonA" for="quickMoonA">
              <span class="quickControlHeader">
                <span class="quickControlLabel">Moon spacing</span>
                <span id="quickMoonAVal" class="mono quickControlValue">-</span>
              </span>
              <input id="quickMoonA" type="range" aria-describedby="quickMoonAHelp" />
              <span id="quickMoonAHelp" class="help">Changes how far the moon leads or trails the planet.</span>
            </label>

            <label class="quickControl" data-quick-control="quickMoonInc" for="quickMoonInc">
              <span class="quickControlHeader">
                <span class="quickControlLabel">Moon inclination</span>
                <span id="quickMoonIncVal" class="mono quickControlValue">-</span>
              </span>
              <input id="quickMoonInc" type="range" aria-describedby="quickMoonIncHelp" />
              <span id="quickMoonIncHelp" class="help">
                Changes how strongly the moon orbit tilts relative to the planet orbit.
              </span>
            </label>

            <label class="quickControl quickControlCheckbox" data-quick-control="quickReflectedLight" for="quickReflectedLight">
              <span class="quickControlHeader"><span class="quickControlLabel">Show reflected light</span></span>
              <span class="help">Adds the visible brightening outside transit from illuminated day sides.</span>
              <input id="quickReflectedLight" type="checkbox" />
            </label>
          </div>
        </fieldset>
  `;
}
