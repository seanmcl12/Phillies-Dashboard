(() => {
  const body = document.body;
  const dataUrl = body.dataset.pitchDataUrl;
  const pitchLabels = {
    CH: "Changeup", CU: "Curveball", FC: "Cutter", FF: "Four-seam fastball",
    FO: "Forkball", FS: "Splitter", FT: "Two-seam fastball", KC: "Knuckle curve",
    SI: "Sinker", SL: "Slider", ST: "Sweeper", SV: "Slurve", KN: "Knuckleball",
    EP: "Eephus", SC: "Screwball"
  };
  const teamNames = {
    AZ: "Arizona Diamondbacks", ARI: "Arizona Diamondbacks",
    ATH: "Athletics", OAK: "Athletics",
    ATL: "Atlanta Braves", BAL: "Baltimore Orioles",
    BOS: "Boston Red Sox", CHC: "Chicago Cubs", CWS: "Chicago White Sox",
    CIN: "Cincinnati Reds", CLE: "Cleveland Guardians", COL: "Colorado Rockies",
    DET: "Detroit Tigers", HOU: "Houston Astros", KC: "Kansas City Royals",
    LAA: "Los Angeles Angels", LAD: "Los Angeles Dodgers", MIA: "Miami Marlins",
    MIL: "Milwaukee Brewers", MIN: "Minnesota Twins", NYM: "New York Mets",
    NYY: "New York Yankees", PHI: "Philadelphia Phillies",
    PIT: "Pittsburgh Pirates", SD: "San Diego Padres", SEA: "Seattle Mariners",
    SF: "San Francisco Giants", STL: "St. Louis Cardinals", TB: "Tampa Bay Rays",
    TEX: "Texas Rangers", TOR: "Toronto Blue Jays", WSH: "Washington Nationals"
  };
  const teamLogoIds = {
    AZ: 109, ARI: 109, ATH: 133, OAK: 133,
    ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113,
    CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108,
    LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147,
    PHI: 143, PIT: 134, SD: 135, SEA: 136, SF: 137, STL: 138,
    TB: 139, TEX: 140, TOR: 141, WSH: 120
  };
  const primaryLogoCodes = new Set(["HOU", "SEA"]);

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const pitchName = (code) => pitchLabels[code] || code || "Unknown";
  const number = (value) => Number.isFinite(value) ? value : null;
  const mean = (values) => values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
  const format = (value, digits = 1) => value === null ? "—" : value.toFixed(digits);
  const playerPhoto = (id) =>
    `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,d_people:generic:headshot:67:current.png/q_auto:good/v1/people/${encodeURIComponent(id)}/headshot/67/current`;
  const displayPlayerName = (name) => {
    const parts = String(name || "").split(", ");
    return parts.length > 1 ? `${parts.slice(1).join(" ")} ${parts[0]}` : parts[0];
  };
  const showError = (element, message) => {
    if (element) element.innerHTML = `<p class="error-message">${escapeHtml(message)}</p>`;
  };

  function rowsFromPayload(payload) {
    const indexes = Object.fromEntries(payload.fields.map((field, index) => [field, index]));
    return payload.pitches.map((values) => {
      const row = {};
      for (const [field, index] of Object.entries(indexes)) row[field] = values[index];
      return row;
    }).filter((row) => row.pitcher && row.home_team && row.away_team);
  }

  function pitcherGroups(rows) {
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.pitcher)) {
        groups.set(row.pitcher, {
          id: row.pitcher,
          name: displayPlayerName(row.player_name) || "Phillies pitcher",
          rows: []
        });
      }
      groups.get(row.pitcher).rows.push(row);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function terminalPitches(rows) {
    const lastByAtBat = new Map();
    for (const row of rows) {
      const key = `${row.game_pk}-${row.at_bat_number}`;
      const previous = lastByAtBat.get(key);
      if (!previous || row.pitch_number > previous.pitch_number) lastByAtBat.set(key, row);
    }
    return [...lastByAtBat.values()].filter((row) => row.events && row.pitch_type);
  }

  function pitchStats(rows) {
    const groups = new Map();
    const terminal = terminalPitches(rows);
    const terminalByType = new Map();
    for (const row of terminal) {
      if (!terminalByType.has(row.pitch_type)) terminalByType.set(row.pitch_type, []);
      terminalByType.get(row.pitch_type).push(row);
    }
    for (const row of rows) {
      if (!row.pitch_type) continue;
      if (!groups.has(row.pitch_type)) {
        groups.set(row.pitch_type, { code: row.pitch_type, rows: [], swings: 0, whiffs: 0 });
      }
      const group = groups.get(row.pitch_type);
      group.rows.push(row);
      const description = String(row.description || "").toLowerCase();
      if (description.includes("swing") || description.includes("foul_tip") ||
          description === "foul" || description === "hit_into_play") group.swings += 1;
      if (description.includes("swinging_strike")) group.whiffs += 1;
    }
    return [...groups.values()].map((group) => {
      const velocities = group.rows.map((row) => number(row.release_speed)).filter((value) => value !== null);
      const terminalRows = terminalByType.get(group.code) || [];
      const strikeouts = terminalRows.filter((row) => row.events === "strikeout").length;
      return {
        ...group,
        count: group.rows.length,
        velocity: mean(velocities),
        whiffRate: group.swings ? group.whiffs / group.swings * 100 : null,
        strikeoutRate: terminalRows.length ? strikeouts / terminalRows.length * 100 : null,
        strikeouts,
        terminalCount: terminalRows.length
      };
    }).sort((a, b) => b.count - a.count);
  }

  function pitcherCard(pitcher) {
    const speeds = pitcher.rows.map((row) => number(row.release_speed)).filter((value) => value !== null);
    return `<a class="pitcher-card" href="/pitchers/${encodeURIComponent(pitcher.id)}">
      <div class="pitcher-photo-wrap">
        <img class="pitcher-photo" src="${playerPhoto(pitcher.id)}" alt="${escapeHtml(pitcher.name)}" loading="lazy"
          onerror="this.hidden=true;this.nextElementSibling.hidden=false">
        <span class="photo-fallback" hidden>${escapeHtml(pitcher.name.split(" ").map((part) => part[0]).join("").slice(0, 2))}</span>
      </div>
      <div class="pitcher-card-copy">
        <span class="pitcher-card-kicker">PHILLIES PITCHER</span>
        <h3>${escapeHtml(pitcher.name)}</h3>
        <p>${pitcher.rows.length.toLocaleString()} pitches <span aria-hidden="true">·</span> ${format(mean(speeds))} mph avg.</p>
        <span class="card-arrow" aria-hidden="true">↗</span>
      </div>
    </a>`;
  }

  function renderPitchers(rows) {
    const pitchers = pitcherGroups(rows);
    const home = document.querySelector("#home-pitchers");
    const all = document.querySelector("#all-pitchers");
    if (home) home.innerHTML = pitchers.slice(0, 8).map(pitcherCard).join("");
    if (all) all.innerHTML = pitchers.map(pitcherCard).join("");
    const pitcherCount = document.querySelector("#season-pitchers");
    if (pitcherCount) pitcherCount.textContent = pitchers.length;
    const select = document.querySelector("#comparison-pitcher");
    if (select) {
      select.innerHTML = `<option value="all">All pitchers</option>` +
        pitchers.map((pitcher) => `<option value="${escapeHtml(pitcher.id)}">${escapeHtml(pitcher.name)}</option>`).join("");
    }
    return pitchers;
  }

  function svgBars(entries, metric, color = "#6f263d") {
    if (!entries.length) return `<p class="empty-message">No pitch data is available for this selection.</p>`;
    const width = 760;
    const height = 300;
    const left = 54;
    const right = 18;
    const top = 20;
    const bottom = 72;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const values = entries.map((entry) => number(entry[metric])).filter((value) => value !== null);
    if (!values.length) return `<p class="empty-message">There are no measurements for this comparison.</p>`;
    const max = Math.max(...values, 1);
    const slot = plotWidth / entries.length;
    const barWidth = Math.min(54, slot * 0.62);
    const bars = entries.map((entry, index) => {
      const value = number(entry[metric]);
      if (value === null) return "";
      const barHeight = value / max * (plotHeight - 22);
      const x = left + index * slot + (slot - barWidth) / 2;
      const y = top + plotHeight - barHeight;
      const label = metric === "velocity" ? `${format(value)} mph`
        : metric === "count" ? value.toLocaleString() : `${format(value)}%`;
      return `<g><title>${escapeHtml(pitchName(entry.code))}: ${label}</title>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color}"/>
        <text class="chart-value" x="${x + barWidth / 2}" y="${Math.max(top + 10, y - 7)}" text-anchor="middle">${label}</text>
        <text class="chart-label" x="${x + barWidth / 2}" y="${top + plotHeight + 20}" text-anchor="middle">${escapeHtml(entry.code)}</text>
      </g>`;
    }).join("");
    const grid = [0, 1, 2, 3].map((step) => {
      const y = top + step * plotHeight / 3;
      return `<line class="chart-gridline" x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/>`;
    }).join("");
    return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart comparing pitch types">
      ${grid}${bars}
    </svg>`;
  }

  function locationSvg(rows) {
    const measured = rows.filter((row) =>
      number(row.plate_x) !== null && number(row.plate_z) !== null && row.pitch_type);
    if (!measured.length) return `<p class="empty-message">No plate-location measurements are available.</p>`;
    const width = 620;
    const height = 360;
    const left = 56;
    const right = 20;
    const top = 18;
    const bottom = 44;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const x = (value) => left + (value + 2.2) / 4.4 * plotWidth;
    const y = (value) => top + (5.2 - value) / 4.4 * plotHeight;
    const stride = Math.max(1, Math.ceil(measured.length / 650));
    const points = measured.filter((_, index) => index % stride === 0).map((row) => {
      const fill = ["FF", "SI", "FT"].includes(row.pitch_type) ? "#6bace4" : "#6f263d";
      return `<circle cx="${x(row.plate_x)}" cy="${y(row.plate_z)}" r="3.1" fill="${fill}" fill-opacity=".52"><title>${escapeHtml(pitchName(row.pitch_type))} · ${format(number(row.release_speed))} mph</title></circle>`;
    }).join("");
    return `<svg class="chart-svg location-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pitch locations over home plate">
      <rect class="strike-zone" x="${x(-0.83)}" y="${y(3.5)}" width="${x(0.83) - x(-0.83)}" height="${y(1.5) - y(3.5)}"/>
      <line class="plate-axis" x1="${left}" x2="${width - right}" y1="${y(2.5)}" y2="${y(2.5)}"/>
      <line class="plate-axis" x1="${x(0)}" x2="${x(0)}" y1="${top}" y2="${height - bottom}"/>
      ${points}
      <text class="axis-label" x="${width / 2}" y="${height - 6}" text-anchor="middle">Horizontal location (ft)</text>
      <text class="axis-label" transform="translate(15 ${height / 2}) rotate(-90)" text-anchor="middle">Height (ft)</text>
      <g class="chart-legend"><circle cx="${width - 182}" cy="18" r="4" fill="#6f263d"/><text x="${width - 172}" y="22">Other pitch types</text>
      <circle cx="${width - 82}" cy="18" r="4" fill="#6bace4"/><text x="${width - 72}" y="22">Fastballs</text></g>
    </svg>`;
  }

  function renderPitcherProfile(rows) {
    const profile = document.querySelector("#pitcher-profile");
    if (!profile) return;
    const id = Number(profile.dataset.pitcherId);
    const pitcher = pitcherGroups(rows).find((item) => item.id === id);
    if (!pitcher) {
      showError(profile, "This pitcher is not included in the 2025 Statcast dataset.");
      return;
    }
    const speeds = pitcher.rows.map((row) => number(row.release_speed)).filter((value) => value !== null);
    const types = pitchStats(pitcher.rows);
    const strikeouts = terminalPitches(pitcher.rows).filter((row) => row.events === "strikeout").length;
    profile.innerHTML = `<img class="profile-photo" src="${playerPhoto(pitcher.id)}" alt="${escapeHtml(pitcher.name)}"
        onerror="this.hidden=true;this.nextElementSibling.hidden=false">
      <span class="photo-fallback profile-fallback" hidden>${escapeHtml(pitcher.name.split(" ").map((part) => part[0]).join("").slice(0, 2))}</span>
      <div><p class="eyebrow eyebrow-dark">2025 PHILLIES</p><h1>${escapeHtml(pitcher.name)}</h1>
      <p>${pitcher.rows.length.toLocaleString()} pitches tracked across the regular season.</p>
      <a class="text-link" href="/pitch-comparison?pitcher=${pitcher.id}">Compare his pitches <span aria-hidden="true">→</span></a></div>`;
    const summary = document.querySelector("#pitcher-summary");
    summary.innerHTML = [
      ["Pitches", pitcher.rows.length.toLocaleString()],
      ["Avg. velocity", `${format(mean(speeds))} mph`],
      ["Pitch types", types.length],
      ["Strikeouts", strikeouts.toLocaleString()]
    ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
    const table = document.querySelector("#pitcher-arsenal");
    table.innerHTML = pitchTable(types);
    document.querySelector("#pitcher-location").innerHTML = locationSvg(pitcher.rows);
  }

  function pitchTable(types) {
    if (!types.length) return `<p class="empty-message">No pitch types were found.</p>`;
    return `<table><thead><tr><th>Pitch</th><th>Count</th><th>Avg. speed</th><th>Whiff rate</th><th>Strikeout rate*</th></tr></thead>
      <tbody>${types.map((type) => `<tr><th>${escapeHtml(pitchName(type.code))}</th><td>${type.count.toLocaleString()}</td>
        <td>${format(type.velocity)} mph</td><td>${format(type.whiffRate)}%</td>
        <td>${format(type.strikeoutRate)}% (${type.strikeouts}/${type.terminalCount})</td></tr>`).join("")}</tbody></table>
      <p class="table-note">*Completed plate appearances ending with this pitch type.</p>`;
  }

  function renderComparison(rows) {
    const pitcherSelect = document.querySelector("#comparison-pitcher");
    const metricSelect = document.querySelector("#comparison-metric");
    const locationSelect = document.querySelector("#location-pitch");
    if (!pitcherSelect || !metricSelect || !locationSelect) return;
    const queryPitcher = new URLSearchParams(location.search).get("pitcher");
    if (queryPitcher && [...pitcherSelect.options].some((option) => option.value === queryPitcher)) {
      pitcherSelect.value = queryPitcher;
    }
    const update = () => {
      const selectedId = pitcherSelect.value;
      const selectedRows = selectedId === "all" ? rows : rows.filter((row) => String(row.pitcher) === selectedId);
      const types = pitchStats(selectedRows);
      const metric = metricSelect.value;
      const metricKey = { velocity: "velocity", count: "count", whiff: "whiffRate", strikeout: "strikeoutRate" }[metric];
      const labels = {
        velocity: "Average release speed by pitch type, in miles per hour.",
        count: "Number of pitches thrown by type.",
        whiff: "Swings that missed divided by tracked swings.",
        strikeout: "Strikeouts divided by completed plate appearances ending on each pitch type."
      };
      document.querySelector("#comparison-description").textContent = labels[metric];
      document.querySelector("#comparison-chart").innerHTML = svgBars(types, metricKey);
      const selectedType = locationSelect.value;
      const locationRows = selectedType === "all" ? selectedRows
        : selectedRows.filter((row) => row.pitch_type === selectedType);
      document.querySelector("#comparison-location").innerHTML = locationSvg(locationRows);
    };
    locationSelect.innerHTML = `<option value="all">All pitch types</option>` +
      [...new Set(rows.map((row) => row.pitch_type).filter(Boolean))]
        .sort().map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(pitchName(code))}</option>`).join("");
    for (const control of [pitcherSelect, metricSelect, locationSelect]) control.addEventListener("change", update);
    update();
  }

  function opponentOf(row) {
    if (row.home_team === "PHI") return row.away_team;
    if (row.away_team === "PHI") return row.home_team;
    return null;
  }

  function renderOpponentList(rows) {
    const container = document.querySelector("#opponent-list");
    if (!container) return;
    const opponents = [...new Set(rows.map(opponentOf).filter(Boolean))].sort();
    container.innerHTML = opponents.map((code) => {
      const appearances = rows.filter((row) => opponentOf(row) === code).length;
      const logoId = teamLogoIds[code];
      const logo = logoId
        ? `<img class="opponent-logo" src="https://www.mlbstatic.com/team-logos/${primaryLogoCodes.has(code) ? "team-primary-on-light" : "team-cap-on-light"}/${logoId}.svg" alt="" width="48" height="48" loading="lazy">`
        : `<span class="opponent-code">${escapeHtml(code)}</span>`;
      return `<a class="opponent-card" href="/opponents/${encodeURIComponent(code)}">
        ${logo}
        <span><strong>${escapeHtml(teamNames[code] || code)}</strong><small>${appearances.toLocaleString()} pitches tracked</small></span>
        <span class="card-arrow" aria-hidden="true">↗</span>
      </a>`;
    }).join("");
    const count = document.querySelector("#season-opponents");
    if (count) count.textContent = opponents.length;
  }

  function renderOpponentAnalysis(rows) {
    const title = document.querySelector("#opponent-title");
    if (!title) return;
    const code = title.dataset.opponent;
    const matchupRows = rows.filter((row) => opponentOf(row) === code);
    if (!matchupRows.length) {
      document.querySelector("#opponent-intro").textContent =
        `No 2025 pitch data was found for ${teamNames[code] || code}.`;
      document.querySelector("#opponent-summary").innerHTML = "";
      showError(document.querySelector("#opponent-chart"), "Select an opponent from the matchup list to view available data.");
      return;
    }
    const types = pitchStats(matchupRows);
    const terminal = terminalPitches(matchupRows);
    const strikeouts = terminal.filter((row) => row.events === "strikeout").length;
    const speeds = matchupRows.map((row) => number(row.release_speed)).filter((value) => value !== null);
    title.textContent = `${teamNames[code] || code} vs. Phillies pitching`;
    document.querySelector("#opponent-intro").textContent =
      `${matchupRows.length.toLocaleString()} pitches tracked against the ${teamNames[code] || code} in the 2025 regular season.`;
    document.querySelector("#opponent-summary").innerHTML = [
      ["Pitches", matchupRows.length.toLocaleString()],
      ["Avg. velocity", `${format(mean(speeds))} mph`],
      ["Strikeouts", strikeouts.toLocaleString()],
      ["Completed plate appearances", terminal.length.toLocaleString()]
    ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
    document.querySelector("#opponent-chart").innerHTML = svgBars(types, "strikeoutRate");
    document.querySelector("#opponent-arsenal").innerHTML = pitchTable(types);
  }

  async function start() {
    if (!dataUrl) return;
    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`Pitch data request failed (${response.status}).`);
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.fields) || !Array.isArray(payload.pitches)) {
        throw new Error("The pitch data file is not in the expected format.");
      }
      const rows = rowsFromPayload(payload);
      if (!rows.length) throw new Error("The pitch data file did not contain any usable pitches.");
      const pitchCount = document.querySelector("#season-pitches");
      if (pitchCount) pitchCount.textContent = rows.length.toLocaleString();
      const opponentCount = document.querySelector("#season-opponents");
      if (opponentCount) opponentCount.textContent = new Set(rows.map(opponentOf).filter(Boolean)).size;
      renderPitchers(rows);
      renderPitcherProfile(rows);
      renderComparison(rows);
      renderOpponentList(rows);
      renderOpponentAnalysis(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The pitch data could not be loaded.";
      for (const selector of [
        "#home-pitchers", "#all-pitchers", "#pitcher-profile", "#comparison-chart",
        "#comparison-location", "#opponent-list", "#opponent-chart"
      ]) {
        const element = document.querySelector(selector);
        if (element) showError(element, message);
      }
    }
  }

  start();
})();
