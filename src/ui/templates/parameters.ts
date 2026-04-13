import { renderParameterBodiesTemplate } from "./parameterBodies";
import { renderParameterObserverStarTemplate } from "./parameterObserverStar";

export function renderParametersTemplate(): string {
  return `
    <section class="panel params" id="paramsSection">
      <h2>Parameters</h2>
      <p id="binaryLabParamNotice" class="help" hidden>
        Binary black-box lab uses a curated detached eclipsing-binary scenario. The generic transit/exomoon
        parameter form is hidden here because its labels do not describe the binary-star contract.
      </p>

      <form id="paramForm" autocomplete="off">
        <fieldset id="quickControlsFieldset" data-ui-tier="normal">
          <legend>Teaching controls</legend>
          <p class="help">
            Normal mode keeps the teaching surface small. These sliders update the model and canvas directly.
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

        <fieldset data-ui-tier="expert">
          <legend>UI Ranges</legend>
          <label
            class="inline"
            for="overrideMode"
            title="Allow values outside the scientifically meaningful ranges defined in scenario.default.json."
          >
            Override mode <input id="overrideMode" type="checkbox" />
          </label>
          <p id="overrideHelp" class="help">
            Default: sliders use physically meaningful ranges with clamping. Override mode permits extreme
            scenarios; hard numerical invariants (e.g. P &gt; 0) are still enforced.
          </p>
          <div id="sliderRoot" class="grid"></div>
        </fieldset>

        <div class="paramCols" data-ui-tier="expert">
          ${renderParameterObserverStarTemplate()}
          ${renderParameterBodiesTemplate()}
          <div class="paramActions">
            <div class="row">
              <button id="btnApplyParams" type="button">Apply</button>
              <button id="btnResetParams" type="button">Reset params</button>
            </div>
            <p id="paramHelp" class="help">
              Changes take effect after pressing <b>Apply</b>. Eccentricity is capped at e &le; 0.95 for
              numerical stability.
            </p>
          </div>
        </div>
      </form>
    </section>
  `;
}
