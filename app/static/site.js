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

  function pitcherShowcaseCard(pitcher, insight) {
    const arsenal = pitchStats(pitcher.rows).slice(0, 3);
    const pitchRows = arsenal.map((pitch) => {
      const share = pitcher.rows.length ? pitch.count / pitcher.rows.length * 100 : 0;
      return `<div class="arsenal-row">
        <span class="arsenal-name">${escapeHtml(pitchName(pitch.code))}</span>
        <span class="arsenal-bar" aria-label="${format(share)} percent of pitches">
          <span class="arsenal-bar-fill" style="width:${Math.max(share, 1)}%"></span>
        </span>
        <span class="arsenal-share">${format(share)}%</span>
        <span class="arsenal-velocity">${format(pitch.velocity)} mph</span>
      </div>`;
    }).join("");
    const initials = pitcher.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
    return `<article class="showcase-card">
      <a class="showcase-card-main" href="/pitchers/${encodeURIComponent(pitcher.id)}">
        <div class="showcase-player">
          <div class="showcase-photo-wrap">
            <img class="showcase-photo" src="${playerPhoto(pitcher.id)}" alt="${escapeHtml(pitcher.name)}" loading="lazy"
              onerror="this.hidden=true;this.nextElementSibling.hidden=false">
            <span class="photo-fallback showcase-photo-fallback" hidden>${escapeHtml(initials)}</span>
          </div>
          <div class="showcase-player-copy">
            <span class="pitcher-card-kicker">PHILLIES PITCHER · 2025 SEASON</span>
            <h3>${escapeHtml(pitcher.name)}</h3>
            <p>2025 regular season · ${pitcher.rows.length.toLocaleString()} tracked pitches</p>
          </div>
          <span class="showcase-season-badge">2025 DATA</span>
        </div>
        <div class="showcase-season-line">
          <p class="showcase-label">SEASON LINE · TRACKED PITCH DATA</p>
          <div class="showcase-stats">
            <div><strong>${insight.strikeouts.toLocaleString()}</strong><span>STRIKEOUTS</span></div>
            <div><strong>${pitcher.rows.length.toLocaleString()}</strong><span>PITCHES</span></div>
            <div><strong>${format(insight.averageVelocity)}</strong><span>AVG. MPH</span></div>
          </div>
        </div>
        <div class="showcase-arsenal">
          <p class="showcase-label">ARSENAL SNAPSHOT</p>
          ${pitchRows || `<p class="empty-clips">No pitch mix data available.</p>`}
        </div>
      </a>
      <a class="showcase-footer" href="/pitchers/${encodeURIComponent(pitcher.id)}">View pitcher profile <span aria-hidden="true">↗</span></a>
    </article>`;
  }

  function renderPitchers(rows) {
    const pitchers = pitcherGroups(rows);
    const home = document.querySelector("#home-pitchers");
    const all = document.querySelector("#all-pitchers");
    const pitcherInsights = pitchers.map((pitcher) => {
      const terminal = terminalPitches(pitcher.rows);
      const speeds = pitcher.rows.map((row) => number(row.release_speed)).filter((value) => value !== null);
      return {
        pitcher,
        strikeouts: terminal.filter((row) => row.events === "strikeout").length,
        averageVelocity: mean(speeds),
        pitchCount: pitcher.rows.length
      };
    });
    const strikeoutLeader = [...pitcherInsights].sort((a, b) => b.strikeouts - a.strikeouts)[0];
    const velocityLeader = [...pitcherInsights]
      .filter((item) => item.averageVelocity !== null)
      .sort((a, b) => b.averageVelocity - a.averageVelocity)[0];
    const workloadLeader = [...pitcherInsights].sort((a, b) => b.pitchCount - a.pitchCount)[0];

    if (home) {
      const featuredIds = [554430, 666200, 650911];
      const featuredPitchers = featuredIds
        .map((id) => pitchers.find((pitcher) => pitcher.id === id))
        .filter(Boolean);
      home.innerHTML = featuredPitchers.map((pitcher, index) => {
        const insight = pitcherInsights.find((item) => item.pitcher.id === pitcher.id);
        return pitcherShowcaseCard(pitcher, insight);
      }).join("");
    }
    if (all) {
      all.innerHTML = pitcherInsights
        .map(({ pitcher, strikeouts, averageVelocity }) =>
          pitcherShowcaseCard(pitcher, { strikeouts, averageVelocity }))
        .join("");
    }
    const pitcherCount = document.querySelector("#season-pitchers");
    if (pitcherCount) pitcherCount.textContent = pitchers.length;
    const terminal = terminalPitches(rows);
    const strikeouts = terminal.filter((row) => row.events === "strikeout").length;
    const strikeoutRate = terminal.length ? strikeouts / terminal.length * 100 : null;
    const swings = rows.filter((row) => {
      const description = String(row.description || "").toLowerCase();
      return description.includes("swing") || description === "foul" || description === "hit_into_play";
    }).length;
    const whiffs = rows.filter((row) => String(row.description || "").toLowerCase().includes("swinging_strike")).length;
    const whiffRate = swings ? whiffs / swings * 100 : null;
    const strikeoutRateElement = document.querySelector("#season-strikeout-rate");
    if (strikeoutRateElement) strikeoutRateElement.textContent = strikeoutRate === null ? "—" : `${format(strikeoutRate)}%`;
    const whiffRateElement = document.querySelector("#season-whiff-rate");
    if (whiffRateElement) whiffRateElement.textContent = whiffRate === null ? "—" : `${format(whiffRate)}%`;

    const snapshot = document.querySelector("#pitching-snapshot");
    if (snapshot) {
      const pitchTypes = pitchStats(rows).filter((type) => type.whiffRate !== null && type.swings >= 30);
      const topPitch = [...pitchTypes].sort((a, b) => b.whiffRate - a.whiffRate)[0];
      const cards = [
        strikeoutLeader ? `<article class="snapshot-card"><span class="snapshot-stat">${strikeoutLeader.strikeouts}</span><h3>${escapeHtml(strikeoutLeader.pitcher.name)} strikeout leader</h3><p>Strikeouts ending completed plate appearances in the 2025 pitch data.</p></article>` : null,
        topPitch ? `<article class="snapshot-card"><span class="snapshot-stat">${format(topPitch.whiffRate)}%</span><h3>${escapeHtml(pitchName(topPitch.code))} whiff rate</h3><p>Based on ${topPitch.swings.toLocaleString()} tracked swings.</p></article>` : null,
        `<article class="snapshot-card"><span class="snapshot-stat">${format(strikeoutRate)}%</span><h3>Plate appearance strikeout rate</h3><p>${strikeouts.toLocaleString()} strikeouts across ${terminal.length.toLocaleString()} completed plate appearances.</p></article>`
      ].filter(Boolean);
      snapshot.innerHTML = cards.join("");
    }
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

  function workloadContext(pitcher) {
    const appearances = new Map();
    for (const row of pitcher.rows) {
      if (!appearances.has(row.game_pk)) appearances.set(row.game_pk, []);
      appearances.get(row.game_pk).push(row);
    }
    const outingDates = [...appearances.values()]
      .map((outing) => new Date(`${outing[0].game_date}T12:00:00Z`))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b - a);
    const uniqueDates = [...new Set(outingDates.map((date) => date.toISOString().slice(0, 10)))]
      .map((date) => new Date(`${date}T12:00:00Z`));

    const latest = uniqueDates[0] || null;
    const restDays = uniqueDates.length > 1
      ? Math.round((uniqueDates[0] - uniqueDates[1]) / 86400000)
      : null;
    const pitchCounts = [...appearances.values()].map((outing) => outing.length);
    const totalPitches = pitcher.rows.length;
    const maxPitches = pitchCounts.length ? Math.max(...pitchCounts) : 0;
    const averagePitches = pitchCounts.length ? Math.round(totalPitches / pitchCounts.length) : 0;
    const sevenDayStart = latest ? new Date(latest) : null;
    if (sevenDayStart) sevenDayStart.setUTCDate(sevenDayStart.getUTCDate() - 6);
    const recentPitches = latest
      ? pitcher.rows.filter((row) => {
          const date = new Date(`${row.game_date}T12:00:00Z`);
          return date >= sevenDayStart && date <= latest;
        }).length
      : 0;
    const recentOutings = latest
      ? uniqueDates.filter((date) => date >= sevenDayStart && date <= latest).length
      : 0;

    return {
      restDays,
      appearances: appearances.size,
      totalPitches,
      averagePitches,
      maxPitches,
      recentPitches,
      recentOutings
    };
  }

  function profileStorageKey(pitcherId, kind) {
    return `phillies-pitcher-profile:${pitcherId}:${kind}`;
  }

  function setupPitcherNotes(pitcherId) {
    const summary = document.querySelector("#pitcher-summary-notes");
    const summaryStatus = document.querySelector("#summary-save-status");
    const clipForm = document.querySelector("#clip-form");
    const clipList = document.querySelector("#pitcher-clips");
    const clipStatus = document.querySelector("#clip-save-status");
    if (!summary || !clipForm || !clipList) return;

    const summaryKey = profileStorageKey(pitcherId, "summary");
    const clipsKey = profileStorageKey(pitcherId, "clips");
    let clips = [];
    try {
      summary.value = localStorage.getItem(summaryKey) || "";
      clips = JSON.parse(localStorage.getItem(clipsKey) || "[]");
      if (!Array.isArray(clips)) clips = [];
    } catch (_) {
      clips = [];
    }

    let saveTimer;
    summary.addEventListener("input", () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        localStorage.setItem(summaryKey, summary.value);
        summaryStatus.textContent = "Summary saved on this device.";
      }, 300);
    });

    const renderClips = () => {
      if (!clips.length) {
        clipList.innerHTML = `<p class="empty-clips">No clips or observations have been added yet.</p>`;
        return;
      }
      clipList.innerHTML = clips.map((clip, index) => `
        <article class="clip-card">
          <a href="${escapeHtml(clip.url)}" target="_blank" rel="noreferrer">${escapeHtml(clip.reference || "Pitch / at-bat clip")}</a>
          <button class="clip-remove" type="button" data-clip-index="${index}" aria-label="Remove clip">Remove</button>
          ${clip.notes ? `<p>${escapeHtml(clip.notes)}</p>` : ""}
        </article>
      `).join("");
      clipList.querySelectorAll(".clip-remove").forEach((button) => {
        button.addEventListener("click", () => {
          clips.splice(Number(button.dataset.clipIndex), 1);
          localStorage.setItem(clipsKey, JSON.stringify(clips));
          renderClips();
          clipStatus.textContent = "Clip removed.";
        });
      });
    };

    clipForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const reference = document.querySelector("#clip-reference").value.trim();
      const url = document.querySelector("#clip-url").value.trim();
      const notes = document.querySelector("#clip-notes").value.trim();
      if (!reference && !url) {
        clipStatus.textContent = "Add a pitch/at-bat reference or video link.";
        return;
      }
      if (url) {
        try {
          const parsed = new URL(url);
          if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
        } catch (_) {
          clipStatus.textContent = "Enter a valid http or https video link.";
          return;
        }
      }
      clips.unshift({ reference, url: url || "#", notes });
      localStorage.setItem(clipsKey, JSON.stringify(clips));
      clipForm.reset();
      clipStatus.textContent = "Clip and observations saved on this device.";
      renderClips();
    });
    renderClips();
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
    const workload = workloadContext(pitcher);
    document.querySelector("#pitcher-workload").innerHTML = `
      <article class="workload-card">
        <h3>Rest between outings</h3>
        <strong>${workload.restDays === null ? "—" : `${workload.restDays} ${workload.restDays === 1 ? "day" : "days"}`}</strong>
        <p>${workload.restDays === null
          ? "A prior tracked outing is needed to estimate a rest interval."
          : "Gap between his two most recent tracked game dates. Use as an activity-monitoring signal."}</p>
      </article>
      <article class="workload-card">
        <h3>Season workload</h3>
        <div class="workload-stats">
          <div class="workload-stat"><span>Tracked outings</span><strong>${workload.appearances}</strong></div>
          <div class="workload-stat"><span>Total pitches</span><strong>${workload.totalPitches.toLocaleString()}</strong></div>
          <div class="workload-stat"><span>Avg. per outing</span><strong>${workload.averagePitches}</strong></div>
          <div class="workload-stat"><span>Highest outing</span><strong>${workload.maxPitches}</strong></div>
        </div>
        <p>Recent 7-day activity: ${workload.recentPitches.toLocaleString()} pitches across ${workload.recentOutings} ${workload.recentOutings === 1 ? "outing" : "outings"}.</p>
      </article>`;
    const table = document.querySelector("#pitcher-arsenal");
    table.innerHTML = pitchTable(types);
    document.querySelector("#pitcher-location").innerHTML = locationSvg(pitcher.rows);
    setupPitcherNotes(pitcher.id);
  }

  function pitchTable(types) {
    if (!types.length) return `<p class="empty-message">No pitch types were found.</p>`;
    return `<table><thead><tr><th>Pitch</th><th>Count</th><th>Avg. speed</th><th>Whiff rate</th><th>Strikeout rate*</th></tr></thead>
      <tbody>${types.map((type) => `<tr><th>${escapeHtml(pitchName(type.code))}</th><td>${type.count.toLocaleString()}</td>
        <td>${format(type.velocity)} mph</td><td>${format(type.whiffRate)}%</td>
        <td>${format(type.strikeoutRate)}% (${type.strikeouts}/${type.terminalCount})</td></tr>`).join("")}</tbody></table>
      <p class="table-note">*Completed plate appearances ending with this pitch type.</p>`;
  }

  const comparisonColors = [
    "#E81828", "#2878B8", "#D39316", "#6548A3", "#18856B", "#D0529A",
    "#67717C", "#9A5A2A", "#00A6A6", "#748C21", "#6D59A8", "#E27632"
  ];
  const colorForPitch = (code, codes) => comparisonColors[Math.max(0, codes.indexOf(code)) % comparisonColors.length];

  function comparisonRows(rows, pitcherId, hand, pitchTypes) {
    return rows.filter((row) =>
      (pitcherId === "all" || String(row.pitcher) === pitcherId) &&
      (hand === "all" || row.stand === hand) &&
      pitchTypes.includes(row.pitch_type));
  }

  function comparisonStats(rows, totalPitchCount = rows.length) {
    const types = pitchStats(rows);
    const terminal = terminalPitches(rows);
    const noAtBatEvents = new Set(["walk", "intent_walk", "hit_by_pitch", "sac_fly", "sac_bunt"]);
    const totalBases = { single: 1, double: 2, triple: 3, home_run: 4 };
    return types.map((type) => {
      const outcomes = terminal.filter((row) => row.pitch_type === type.code);
      const atBats = outcomes.filter((row) => !noAtBatEvents.has(row.events));
      const hits = atBats.filter((row) => totalBases[row.events]);
      const bases = hits.reduce((sum, row) => sum + totalBases[row.events], 0);
      const speedRows = type.rows.map((row) => number(row.release_speed)).filter((value) => value !== null);
      const spinRows = type.rows.map((row) => number(row.release_spin_rate)).filter((value) => value !== null);
      const horizontal = type.rows.map((row) => number(row.pfx_x)).filter((value) => value !== null);
      const vertical = type.rows.map((row) => number(row.pfx_z)).filter((value) => value !== null);
      return {
        ...type,
        velocity: mean(speedRows),
        spin: mean(spinRows),
        horizontal: mean(horizontal),
        vertical: mean(vertical),
        usage: totalPitchCount ? type.count / totalPitchCount * 100 : null,
        battingAverage: atBats.length ? hits.length / atBats.length : null,
        slugging: atBats.length ? bases / atBats.length : null,
        atBats: atBats.length
      };
    });
  }

  function comparisonSummaryTable(series) {
    const groups = series.flatMap(({ pitcher, rows, basePitchCount }) =>
      comparisonStats(rows, basePitchCount).map((stats) => ({ pitcher, stats })));
    if (!groups.length) return `<p class="empty-message">No pitches match these filters.</p>`;
    return `${groups.length ? `<div class="table-wrap comparison-table-wrap"><table><thead><tr><th>Pitcher</th><th>Pitch type</th><th>Usage</th><th>Avg velo</th><th>Spin</th><th>H break</th><th>V break</th><th>Whiff</th><th>Opp AVG</th><th>Opp SLG</th><th>Sample</th></tr></thead>
      <tbody>${groups.map(({ pitcher, stats }) => `<tr>
        <th>${escapeHtml(pitcher.name)}</th><td>${escapeHtml(pitchName(stats.code))}</td>
        <td>${format(stats.usage)}%</td><td>${format(stats.velocity)} mph</td><td>${stats.spin === null ? "—" : `${Math.round(stats.spin)} rpm`}</td>
        <td>${format(stats.horizontal)} ft</td><td>${format(stats.vertical)} ft</td><td>${format(stats.whiffRate)}%</td>
        <td>${stats.battingAverage === null ? "—" : stats.battingAverage.toFixed(3).replace(/^0/, "")}</td>
        <td>${stats.slugging === null ? "—" : stats.slugging.toFixed(3).replace(/^0/, "")}</td>
        <td>${stats.count.toLocaleString()} pitches · ${stats.atBats} AB${stats.count < 30 ? `<span class="sample-warning">Low sample</span>` : ""}</td>
      </tr>`).join("")}</tbody></table><p class="table-note">Pitch types with fewer than 30 tracked pitches are marked low sample; outcome rates use only completed plate appearances.</p></div>` : `<p class="empty-message">No pitches match these filters.</p>`}`;
  }

  function movementSvg(series, pitchTypes) {
    const measured = series.flatMap(({ pitcher, pitcherIndex, rows }) =>
      rows.filter((row) => number(row.pfx_x) !== null && number(row.pfx_z) !== null)
        .map((row) => ({ ...row, pitcher, pitcherIndex })));
    if (!measured.length) return `<p class="empty-message">No movement measurements match these filters.</p>`;
    const width = 720;
    const height = 390;
    const left = 60;
    const right = 22;
    const top = 24;
    const bottom = 54;
    const valuesX = measured.map((row) => row.pfx_x);
    const valuesY = measured.map((row) => row.pfx_z);
    const xMin = Math.min(...valuesX, -2);
    const xMax = Math.max(...valuesX, 2);
    const yMin = Math.min(...valuesY, -2);
    const yMax = Math.max(...valuesY, 2);
    const x = (value) => left + (value - xMin) / (xMax - xMin || 1) * (width - left - right);
    const y = (value) => top + (yMax - value) / (yMax - yMin || 1) * (height - top - bottom);
    const pitchPoints = measured.map((row) => {
      const fill = colorForPitch(row.pitch_type, pitchTypes);
      const point = row.pitcherIndex === 0
        ? `<circle cx="${x(row.pfx_x)}" cy="${y(row.pfx_z)}" r="3.1" fill="${fill}" fill-opacity=".52"/>`
        : `<rect x="${x(row.pfx_x) - 2.8}" y="${y(row.pfx_z) - 2.8}" width="5.6" height="5.6" fill="${fill}" fill-opacity=".62"/>`;
      return `<g><title>${escapeHtml(row.pitcher)} · ${escapeHtml(pitchName(row.pitch_type))}</title>${point}</g>`;
    }).join("");
    const xTicks = [0, 1, 2, 3, 4].map((step) => {
      const value = xMin + step * (xMax - xMin) / 4;
      return `<g><line class="chart-gridline" x1="${x(value)}" x2="${x(value)}" y1="${top}" y2="${height - bottom}"/><text class="axis-label" x="${x(value)}" y="${height - bottom + 18}" text-anchor="middle">${format(value)}</text></g>`;
    }).join("");
    const yTicks = [0, 1, 2, 3, 4].map((step) => {
      const value = yMin + step * (yMax - yMin) / 4;
      return `<g><line class="chart-gridline" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text class="axis-label" x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${format(value)}</text></g>`;
    }).join("");
    const legend = pitchTypes.map((code, index) =>
      `<g transform="translate(${left + (index % 4) * 145} ${top + 12 + Math.floor(index / 4) * 18})"><circle r="4" fill="${colorForPitch(code, pitchTypes)}"/><text class="axis-label" x="9" y="4">${escapeHtml(pitchName(code))}</text></g>`
    ).join("");
    return `<svg class="chart-svg comparison-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pitch movement plot">
      ${xTicks}${yTicks}${legend}
      <g transform="translate(${width - 164} ${height - 28})"><circle cx="0" cy="0" r="4" fill="#68717b"/><text class="axis-label" x="8" y="4">Pitcher 1</text><rect x="76" y="-4" width="8" height="8" fill="#68717b"/><text class="axis-label" x="89" y="4">Pitcher 2</text></g>
      ${pitchPoints}
      <text class="axis-label" x="${(left + width - right) / 2}" y="${height - 5}" text-anchor="middle">Horizontal movement (ft)</text>
      <text class="axis-label" transform="translate(14 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle">Vertical movement (ft)</text>
    </svg>`;
  }

  function comparisonLocationSvg(rows, hand, pitchTypes) {
    const measured = rows.filter((row) =>
      row.stand === hand && number(row.plate_x) !== null && number(row.plate_z) !== null && row.pitch_type);
    if (!measured.length) return `<p class="empty-message">No ${hand === "R" ? "right" : "left"}-handed batter locations match these filters.</p>`;
    const width = 620;
    const height = 360;
    const left = 56;
    const right = 20;
    const top = 28;
    const bottom = 44;
    const x = (value) => left + (value + 2.2) / 4.4 * (width - left - right);
    const y = (value) => top + (5.2 - value) / 4.4 * (height - top - bottom);
    const stride = Math.max(1, Math.ceil(measured.length / 700));
    const points = measured.filter((_, index) => index % stride === 0).map((row) =>
      `<circle cx="${x(row.plate_x)}" cy="${y(row.plate_z)}" r="3" fill="${colorForPitch(row.pitch_type, pitchTypes)}" fill-opacity=".58"><title>${escapeHtml(pitchName(row.pitch_type))} · ${format(number(row.release_speed))} mph · ${hand === "R" ? "RHH" : "LHH"}</title></circle>`
    ).join("");
    const legend = pitchTypes.slice(0, 6).map((code, index) =>
      `<g transform="translate(${left + (index % 3) * 170} ${top + 9 + Math.floor(index / 3) * 16})"><circle r="4" fill="${colorForPitch(code, pitchTypes)}"/><text class="axis-label" x="8" y="4">${escapeHtml(pitchName(code))}</text></g>`
    ).join("");
    return `<svg class="chart-svg comparison-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pitch locations versus ${hand === "R" ? "right" : "left"}-handed batters">
      <rect class="strike-zone" x="${x(-0.83)}" y="${y(3.5)}" width="${x(0.83) - x(-0.83)}" height="${y(1.5) - y(3.5)}"/>
      <line class="plate-axis" x1="${left}" x2="${width - right}" y1="${y(2.5)}" y2="${y(2.5)}"/>
      <line class="plate-axis" x1="${x(0)}" x2="${x(0)}" y1="${top}" y2="${height - bottom}"/>
      ${legend}${points}
      <text class="axis-label" x="${width / 2}" y="${height - 6}" text-anchor="middle">Horizontal plate location (ft)</text>
      <text class="axis-label" transform="translate(15 ${height / 2}) rotate(-90)" text-anchor="middle">Height (ft)</text>
    </svg>`;
  }

  function trendSvg(series, pitchTypes, metric) {
    const valueFor = (row) => metric === "velocity" ? number(row.release_speed) : number(row[metric]);
    const grouped = [];
    for (const item of series) {
      for (const code of pitchTypes) {
        const byDate = new Map();
        for (const row of item.rows) {
          if (row.pitch_type !== code || !row.game_date) continue;
          const value = valueFor(row);
          if (value === null) continue;
          if (!byDate.has(row.game_date)) byDate.set(row.game_date, []);
          byDate.get(row.game_date).push(value);
        }
        grouped.push({
          pitcher: item.pitcher,
          pitcherIndex: item.pitcherIndex,
          code,
          points: [...byDate.entries()].map(([date, values]) => ({ date, value: mean(values) }))
            .sort((a, b) => a.date.localeCompare(b.date))
        });
      }
    }
    const active = grouped.filter((line) => line.points.length);
    if (!active.length) return `<p class="empty-message">No game-by-game measurements match these filters.</p>`;
    const dates = active.flatMap((line) => line.points.map((point) => point.date));
    const values = active.flatMap((line) => line.points.map((point) => point.value));
    const width = 720;
    const height = 320;
    const left = 56;
    const right = 22;
    const top = 76;
    const bottom = 45;
    const xMin = Date.parse(`${dates.sort()[0]}T00:00:00Z`);
    const xMax = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`);
    const yMin = Math.min(...values);
    const yMax = Math.max(...values);
    const x = (date) => left + (Date.parse(`${date}T00:00:00Z`) - xMin) / (xMax - xMin || 1) * (width - left - right);
    const y = (value) => top + (yMax - value) / (yMax - yMin || 1) * (height - top - bottom);
    const grid = [0, 1, 2, 3].map((step) => {
      const value = yMin + (yMax - yMin) * step / 3;
      const yy = y(value);
      return `<g><line class="chart-gridline" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="${left - 7}" y="${yy + 4}" text-anchor="end">${format(value)}</text></g>`;
    }).join("");
    const lines = active.map((line) => {
      const points = line.points.map((point) => `${x(point.date)},${y(point.value)}`).join(" ");
      const color = colorForPitch(line.code, pitchTypes);
      const dash = line.pitcherIndex ? ` stroke-dasharray="5 4"` : "";
      return `<g><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"${dash}/>${line.points.map((point) => `<circle cx="${x(point.date)}" cy="${y(point.value)}" r="2.7" fill="${color}"><title>${escapeHtml(line.pitcher)} · ${escapeHtml(pitchName(line.code))} · ${point.date}: ${format(point.value)}</title></circle>`).join("")}</g>`;
    }).join("");
    const activeCodes = [...new Set(active.map((line) => line.code))];
    const legend = activeCodes.map((code, index) =>
      `<g transform="translate(${left + (index % 4) * 145} ${20 + Math.floor(index / 4) * 17})"><circle r="4" fill="${colorForPitch(code, pitchTypes)}"/><text class="axis-label" x="9" y="4">${escapeHtml(pitchName(code))}</text></g>`
    ).join("");
    const dateLabels = [...new Set(dates)].filter((_, index, allDates) =>
      index === 0 || index === allDates.length - 1 || index % Math.ceil(allDates.length / 5) === 0
    ).map((date) => `<text class="axis-label" x="${x(date)}" y="${height - 12}" text-anchor="middle">${date.slice(5)}</text>`).join("");
    const unit = metric === "velocity" ? "Velocity (mph)" : `${metric === "pfx_x" ? "Horizontal" : "Vertical"} movement (ft)`;
    return `<svg class="chart-svg comparison-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${unit} by game date">
      ${grid}${legend}${lines}${dateLabels}
      <text class="axis-label" transform="translate(14 ${height / 2}) rotate(-90)" text-anchor="middle">${unit}</text>
    </svg>`;
  }

  function comparisonTakeaway(series) {
    if (series.length < 1) return `<p>No pitches match these filters. Try another pitcher or pitch type.</p>`;
    if (series.every((item) => item.rows.length === 0)) return `<p>No pitches match these filters. Try another pitcher, pitch type or batter handedness.</p>`;
    const first = comparisonStats(series[0].rows, series[0].basePitchCount);
    if (series.length > 1) {
      const second = comparisonStats(series[1].rows, series[1].basePitchCount);
      const shared = first.map((a) => ({ first: a, second: second.find((b) => b.code === a.code) }))
        .filter((pair) => pair.second && pair.first.swings >= 10 && pair.second.swings >= 10);
      const whiffEdge = [...shared].sort((a, b) =>
        (b.first.whiffRate ?? -1) - (b.second.whiffRate ?? -1) -
        ((a.first.whiffRate ?? -1) - (a.second.whiffRate ?? -1))
      )[0];
      if (whiffEdge && whiffEdge.first.whiffRate !== null && whiffEdge.second.whiffRate !== null) {
        const leader = whiffEdge.first.whiffRate >= whiffEdge.second.whiffRate ? series[0].pitcher.name : series[1].pitcher.name;
        const edge = Math.abs(whiffEdge.first.whiffRate - whiffEdge.second.whiffRate);
        return `<p><strong>${escapeHtml(leader)}</strong> has the higher tracked whiff rate on ${escapeHtml(pitchName(whiffEdge.first.code))} by ${format(edge)} percentage points (${whiffEdge.first.swings.toLocaleString()} vs. ${whiffEdge.second.swings.toLocaleString()} swings).</p>`;
      }
      return `<p>There aren’t enough shared pitch types with at least 10 tracked swings from each pitcher to make a reliable whiff-rate comparison.</p>`;
    }
    if (!first.length) return `<p>No pitch types match these filters.</p>`;
    const highUse = [...first].sort((a, b) => b.usage - a.usage)[0];
    const mostWhiffs = [...first].filter((stats) => stats.whiffRate !== null && stats.swings >= 10)
      .sort((a, b) => b.whiffRate - a.whiffRate)[0];
    if (mostWhiffs && highUse.code !== mostWhiffs.code) {
      return `<p>${escapeHtml(pitchName(highUse.code))} is used most often (${format(highUse.usage)}%, ${highUse.count.toLocaleString()} pitches), while ${escapeHtml(pitchName(mostWhiffs.code))} has the highest tracked whiff rate (${format(mostWhiffs.whiffRate)}% on ${mostWhiffs.swings.toLocaleString()} swings).</p>`;
    }
    return `<p>${escapeHtml(pitchName(highUse.code))} is the most-used pitch (${format(highUse.usage)}%, ${highUse.count.toLocaleString()} pitches). Whiff comparisons are shown only when there are at least 10 tracked swings.</p>`;
  }

  function renderComparison(rows) {
    const pitcherSelect = document.querySelector("#comparison-pitcher");
    const secondPitcherSelect = document.querySelector("#comparison-pitcher-2");
    const pitchSelect = document.querySelector("#comparison-pitches");
    const handSelect = document.querySelector("#comparison-hand");
    const trendMetricSelect = document.querySelector("#comparison-trend-metric");
    if (!pitcherSelect || !secondPitcherSelect || !pitchSelect || !handSelect || !trendMetricSelect) return;

    const pitchers = pitcherGroups(rows);
    const options = pitchers.map((pitcher) =>
      `<option value="${escapeHtml(pitcher.id)}">${escapeHtml(pitcher.name)}</option>`
    ).join("");
    pitcherSelect.innerHTML = `<option value="all">All pitchers</option>${options}`;
    secondPitcherSelect.innerHTML = `<option value="">No comparison</option>${options}`;
    const queryPitcher = new URLSearchParams(location.search).get("pitcher");
    if (queryPitcher && [...pitcherSelect.options].some((option) => option.value === queryPitcher)) {
      pitcherSelect.value = queryPitcher;
    }
    const codes = [...new Set(rows.map((row) => row.pitch_type).filter(Boolean))].sort();
    pitchSelect.innerHTML = codes.map((code) =>
      `<label class="pitch-checkbox"><input type="checkbox" value="${escapeHtml(code)}" checked><span>${escapeHtml(pitchName(code))}</span></label>`
    ).join("");

    const update = () => {
      const selectedTypes = [...pitchSelect.querySelectorAll('input[type="checkbox"]:checked')]
        .map((input) => input.value);
      const hand = handSelect.value;
      const selected = [
        { id: pitcherSelect.value, index: 0 },
        ...(secondPitcherSelect.value && secondPitcherSelect.value !== pitcherSelect.value
          ? [{ id: secondPitcherSelect.value, index: 1 }] : [])
      ].map(({ id, index }) => {
        const pitcher = id === "all"
          ? { name: "All pitchers", id: "all" }
          : pitchers.find((item) => String(item.id) === id);
        const baseRows = comparisonRows(rows, id, hand, codes);
        return pitcher ? {
          pitcher,
          pitcherIndex: index,
          rows: comparisonRows(rows, id, hand, selectedTypes),
          basePitchCount: baseRows.length
        } : null;
      }).filter(Boolean);

      document.querySelector("#comparison-summary").innerHTML = comparisonSummaryTable(selected);
      document.querySelector("#comparison-movement").innerHTML = movementSvg(selected, selectedTypes);
      document.querySelector("#comparison-trends").innerHTML = trendSvg(selected, selectedTypes, trendMetricSelect.value);
      const locationRows = selected.flatMap((item) => item.rows);
      document.querySelector("#comparison-location-right").innerHTML = comparisonLocationSvg(locationRows, "R", selectedTypes);
      document.querySelector("#comparison-location-left").innerHTML = comparisonLocationSvg(locationRows, "L", selectedTypes);
      document.querySelector("#comparison-takeaway").innerHTML = comparisonTakeaway(selected);
    };

    for (const control of [pitcherSelect, secondPitcherSelect, pitchSelect, handSelect, trendMetricSelect]) {
      control.addEventListener("change", update);
    }
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

  function opponentLineupTable(matchupRows) {
    const hitters = new Map();
    const noAtBatEvents = new Set(["walk", "intent_walk", "hit_by_pitch", "sac_fly", "sac_bunt"]);
    const onBaseEvents = new Set(["walk", "intent_walk", "hit_by_pitch"]);
    const hitEvents = new Set(["single", "double", "triple", "home_run"]);
    for (const row of terminalPitches(matchupRows)) {
      if (!row.batter) continue;
      if (!hitters.has(row.batter)) {
        hitters.set(row.batter, {
          id: row.batter,
          name: row.batter_name || `Batter ${row.batter}`,
          plateAppearances: 0,
          atBats: 0,
          hits: 0,
          strikeouts: 0,
          homeRuns: 0,
          totalBases: 0,
          walks: 0,
          hitByPitch: 0,
          sacrificeFlies: 0,
          pitcherHand: { R: { atBats: 0, hits: 0, bases: 0, walks: 0, hbp: 0, sacrificeFlies: 0 }, L: { atBats: 0, hits: 0, bases: 0, walks: 0, hbp: 0, sacrificeFlies: 0 } }
        });
      }
      const hitter = hitters.get(row.batter);
      const hand = row.p_throws === "R" || row.p_throws === "L" ? row.p_throws : null;
      const handStats = hand ? hitter.pitcherHand[hand] : null;
      hitter.plateAppearances += 1;
      if (!noAtBatEvents.has(row.events)) hitter.atBats += 1;
      if (hitEvents.has(row.events)) hitter.hits += 1;
      if (row.events === "strikeout" || row.events === "strikeout_double_play") hitter.strikeouts += 1;
      const bases = { single: 1, double: 2, triple: 3, home_run: 4 }[row.events] || 0;
      hitter.totalBases += bases;
      if (row.events === "home_run") hitter.homeRuns += 1;
      if (row.events === "walk" || row.events === "intent_walk") hitter.walks += 1;
      if (row.events === "hit_by_pitch") hitter.hitByPitch += 1;
      if (row.events === "sac_fly") hitter.sacrificeFlies += 1;
      if (handStats) {
        if (!noAtBatEvents.has(row.events)) handStats.atBats += 1;
        if (hitEvents.has(row.events)) handStats.hits += 1;
        handStats.bases += bases;
        if (row.events === "walk" || row.events === "intent_walk") handStats.walks += 1;
        if (row.events === "hit_by_pitch") handStats.hbp += 1;
        if (row.events === "sac_fly") handStats.sacrificeFlies += 1;
      }
    }

    const lineup = [...hitters.values()]
      .sort((a, b) => b.plateAppearances - a.plateAppearances || a.name.localeCompare(b.name))
      .slice(0, 9);
    if (!lineup.length) return `<p class="empty-message">No completed plate appearances were found.</p>`;

    const formatRate = (value) => value === null ? "—" : value.toFixed(3).replace(/^0/, "");
    const rateLine = (stats) => {
      const average = stats.atBats ? stats.hits / stats.atBats : null;
      const hitByPitch = stats.hbp ?? stats.hitByPitch ?? 0;
      const onBaseDenominator = stats.atBats + stats.walks + hitByPitch + stats.sacrificeFlies;
      const onBase = onBaseDenominator
        ? (stats.hits + stats.walks + hitByPitch) / onBaseDenominator
        : null;
      const totalBases = stats.bases ?? stats.totalBases ?? 0;
      const slugging = stats.atBats ? totalBases / stats.atBats : null;
      return { average, ops: onBase === null || slugging === null ? null : onBase + slugging };
    };

    return lineup.map((hitter, index) => {
      const overall = rateLine(hitter);
      const rightHanded = rateLine(hitter.pitcherHand.R);
      const leftHanded = rateLine(hitter.pitcherHand.L);
      const initials = hitter.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
      const split = [
        hitter.pitcherHand.R.atBats ? `vs RHP ${formatRate(rightHanded.average)}` : null,
        hitter.pitcherHand.L.atBats ? `vs LHP ${formatRate(leftHanded.average)}` : null
      ].filter(Boolean).join(" · ");
      return `<article class="batter-card">
        <div class="batter-card-main">
          <div class="batter-card-player">
            <div class="batter-card-photo-wrap">
              <img src="${playerPhoto(hitter.id)}" alt="" loading="lazy"
                onerror="this.hidden=true;this.nextElementSibling.hidden=false">
              <span class="photo-fallback batter-card-fallback" hidden>${escapeHtml(initials)}</span>
            </div>
            <div class="batter-card-name">
              <span class="batter-card-kicker">#${index + 1} · 2025 MATCHUP</span>
              <h3>${escapeHtml(hitter.name)}</h3>
              <p>${hitter.plateAppearances} ${hitter.plateAppearances === 1 ? "plate appearance" : "plate appearances"} vs. Phillies pitching</p>
            </div>
            <span class="batter-card-badge">${hitter.homeRuns ? `${hitter.homeRuns} HR` : "BATTER"}</span>
          </div>
          <div class="batter-card-statline">
            <p class="batter-card-label">2025 HITTING · TRACKED APPEARANCES</p>
            <div class="batter-card-stats">
              <div><strong>${formatRate(overall.average)}</strong><span>AVG</span></div>
              <div><strong>${formatRate(overall.ops)}</strong><span>OPS</span></div>
              <div><strong>${hitter.homeRuns}</strong><span>HR</span></div>
            </div>
          </div>
          <div class="batter-card-footer">
            <span>${hitter.hits} H · ${hitter.atBats} AB · ${hitter.strikeouts} K</span>
            <span>${split || "No handedness split available"}</span>
          </div>
        </div>
      </article>`;
    }).join("");
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
      document.querySelector("#opponent-lineup").innerHTML =
        `<p class="empty-message">No lineup data was found.</p>`;
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
    document.querySelector("#opponent-lineup").innerHTML = opponentLineupTable(matchupRows);
    document.querySelector("#opponent-chart").innerHTML = svgBars(types, "strikeoutRate");
    document.querySelector("#opponent-arsenal").innerHTML = pitchTable(types);
  }

  const gameOuts = {
    field_out: 1, force_out: 1, grounded_into_double_play: 2,
    double_play: 2, strikeout: 1, strikeout_double_play: 2,
    fielders_choice_out: 1, sac_fly: 1, sac_bunt: 1
  };
  const hitEvents = new Set(["single", "double", "triple", "home_run"]);
  const baseValues = { single: 1, double: 2, triple: 3, home_run: 4 };

  function opponentOfGame(rows) {
    const row = rows[0];
    if (!row) return null;
    return row.home_team === "PHI" ? row.away_team : row.home_team;
  }

  function gameAppearances(rows) {
    const byGame = new Map();
    for (const row of rows) {
      if (!byGame.has(row.game_pk)) byGame.set(row.game_pk, []);
      byGame.get(row.game_pk).push(row);
    }

    return [...byGame.entries()].flatMap(([gameId, gameRows]) => {
      const byPitcher = new Map();
      for (const row of gameRows) {
        if (!byPitcher.has(row.pitcher)) byPitcher.set(row.pitcher, []);
        byPitcher.get(row.pitcher).push(row);
      }
      const orderedPitchers = [...byPitcher.entries()].sort((a, b) => {
        const firstAtBatA = Math.min(...a[1].map((row) => row.at_bat_number));
        const firstAtBatB = Math.min(...b[1].map((row) => row.at_bat_number));
        return firstAtBatA - firstAtBatB;
      });
      return orderedPitchers.map(([pitcherId, pitcherRows], index) => {
        const terminals = terminalPitches(pitcherRows);
        const outs = terminals.reduce((total, row) => total + (gameOuts[row.events] || 0), 0);
        const strikeouts = terminals.filter((row) =>
          ["strikeout", "strikeout_double_play"].includes(row.events)).length;
        const hits = terminals.filter((row) => hitEvents.has(row.events));
        const atBats = terminals.filter((row) =>
          !["walk", "intent_walk", "hit_by_pitch", "sac_fly", "sac_bunt"].includes(row.events));
        const pitchSpeeds = pitcherRows.map((row) => number(row.release_speed)).filter((value) => value !== null);
        const walks = terminals.filter((row) => ["walk", "intent_walk", "hit_by_pitch"].includes(row.events)).length;
        return {
          gameId: Number(gameId),
          pitcherId: Number(pitcherId),
          pitcher: displayPlayerName(pitcherRows[0].player_name) || "Phillies pitcher",
          date: pitcherRows[0].game_date,
          opponent: opponentOfGame(pitcherRows),
          venue: pitcherRows[0].home_team === "PHI" ? "Home" : "Away",
          role: index === 0 ? "Starter" : "Reliever",
          roleInferred: true,
          pitchCount: pitcherRows.length,
          outs,
          innings: `${Math.floor(outs / 3)}.${outs % 3}`,
          strikeouts,
          hits: hits.length,
          walks,
          atBats: atBats.length,
          average: atBats.length ? hits.length / atBats.length : null,
          slugging: atBats.length
            ? hits.reduce((total, row) => total + baseValues[row.events], 0) / atBats.length : null,
          averageVelocity: mean(pitchSpeeds),
          rows: pitcherRows,
          terminalRows: terminals
        };
      });
    });
  }

  function gameLogCellButton(label, key, direction) {
    return `<button class="sort-button" type="button" data-sort="${key}" aria-label="Sort by ${label}">${label}<span aria-hidden="true">${direction === key ? " ↓" : ""}</span></button>`;
  }

  function renderGameLog(rows) {
    const table = document.querySelector("#game-log-table");
    const status = document.querySelector("#game-log-status");
    const form = document.querySelector("#game-log-filters");
    if (!table || !status || !form) return;

    const pitcherSelect = document.querySelector("#game-filter-pitcher");
    const opponentSelect = document.querySelector("#game-filter-opponent");
    const roleSelect = document.querySelector("#game-filter-role");
    const fromDate = document.querySelector("#game-filter-from");
    const toDate = document.querySelector("#game-filter-to");
    const seasonSelect = document.querySelector("#game-filter-season");
    const appearances = gameAppearances(rows);
    const pitchers = [...new Map(appearances.map((item) => [item.pitcherId, item.pitcher])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]));
    const opponents = [...new Set(appearances.map((item) => item.opponent).filter(Boolean))].sort();
    pitcherSelect.innerHTML = `<option value="all">All pitchers</option>` +
      pitchers.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join("");
    opponentSelect.innerHTML = `<option value="all">All opponents</option>` +
      opponents.map((code) => `<option value="${escapeHtml(code)}">${escapeHtml(teamNames[code] || code)}</option>`).join("");

    let sortKey = "date";
    let sortDirection = "desc";
    const render = () => {
      const filtered = appearances.filter((item) =>
        (pitcherSelect.value === "all" || String(item.pitcherId) === pitcherSelect.value) &&
        (opponentSelect.value === "all" || item.opponent === opponentSelect.value) &&
        (roleSelect.value === "all" || item.role.toLowerCase() === roleSelect.value) &&
        (!fromDate.value || item.date >= fromDate.value) &&
        (!toDate.value || item.date <= toDate.value) &&
        (!seasonSelect.value || item.date.startsWith(seasonSelect.value))
      );
      const factor = sortDirection === "asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const left = a[sortKey];
        const right = b[sortKey];
        if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
        return String(left ?? "").localeCompare(String(right ?? "")) * factor;
      });
      status.textContent = filtered.length
        ? `${filtered.length} pitching ${filtered.length === 1 ? "appearance" : "appearances"}`
        : "No pitching appearances match these filters.";
      if (!filtered.length) {
        table.innerHTML = `<p class="empty-message">No results. Try clearing or adjusting the filters.</p>`;
        return;
      }
      table.innerHTML = `<table><thead><tr>
        <th>${gameLogCellButton("Date", "date", sortDirection === "asc" ? sortKey : "")}</th>
        <th>${gameLogCellButton("Opponent", "opponent", sortDirection === "asc" ? sortKey : "")}</th><th>Home/Away</th>
        <th>${gameLogCellButton("Pitcher", "pitcher", sortDirection === "asc" ? sortKey : "")}</th><th>Role</th>
        <th>${gameLogCellButton("IP*", "outs", sortDirection === "asc" ? sortKey : "")}</th>
        <th>${gameLogCellButton("Pitches", "pitchCount", sortDirection === "asc" ? sortKey : "")}</th>
        <th>${gameLogCellButton("K", "strikeouts", sortDirection === "asc" ? sortKey : "")}</th><th>H</th><th>BB/HBP</th><th>Avg velo</th><th>Opponent AVG</th>
      </tr></thead><tbody>${filtered.map((item) => `<tr>
        <td><a class="game-log-link" href="/game-log/${item.gameId}/${item.pitcherId}">${escapeHtml(item.date)}</a></td>
        <td>${escapeHtml(teamNames[item.opponent] || item.opponent || "Unknown")}</td><td>${item.venue}</td>
        <td>${escapeHtml(item.pitcher)}</td><td>${item.role}<sup>*</sup></td><td>${item.innings}</td>
        <td>${item.pitchCount}</td><td>${item.strikeouts}</td><td>${item.hits}</td><td>${item.walks}</td>
        <td>${format(item.averageVelocity)} mph</td><td>${item.average === null ? "—" : item.average.toFixed(3).replace(/^0/, "")}</td>
      </tr>`).join("")}</tbody></table><p class="table-note">*Role is inferred by appearance order; IP is estimated from recorded outs.</p>`;
      table.querySelectorAll("button[data-sort]").forEach((button) => {
        button.addEventListener("click", () => {
          const nextKey = button.dataset.sort;
          if (sortKey === nextKey) sortDirection = sortDirection === "asc" ? "desc" : "asc";
          else {
            sortKey = nextKey;
            sortDirection = nextKey === "date" ? "desc" : "asc";
          }
          render();
        });
      });
    };
    form.addEventListener("change", render);
    fromDate.addEventListener("input", render);
    toDate.addEventListener("input", render);
    form.addEventListener("reset", () => window.setTimeout(render, 0));
    render();
  }

  function renderGameDetail(rows) {
    const container = document.querySelector("#game-detail");
    if (!container) return;
    const gameId = Number(container.dataset.gameId);
    const pitcherId = Number(container.dataset.pitcherId);
    const appearance = gameAppearances(rows).find((item) =>
      item.gameId === gameId && item.pitcherId === pitcherId);
    if (!appearance) {
      showError(container, "This pitching appearance is not included in the 2025 Statcast dataset.");
      return;
    }
    const types = pitchStats(appearance.rows);
    container.innerHTML = `
      <p class="eyebrow eyebrow-dark">2025 GAME APPEARANCE</p>
      <h1 class="game-detail-title">${escapeHtml(appearance.pitcher)}</h1>
      <p class="game-detail-subtitle">${escapeHtml(appearance.date)} · ${appearance.venue} vs. ${escapeHtml(teamNames[appearance.opponent] || appearance.opponent)}</p>
      <p class="game-log-context">Role: ${appearance.role} (inferred from tracked appearance order). Innings are estimated from recorded plate-appearance outs; baserunning outs may be missing.</p>
      <div class="summary-grid game-detail-stats">
        ${[
          ["Estimated IP", appearance.innings], ["Pitches", appearance.pitchCount],
          ["Strikeouts", appearance.strikeouts], ["Hits", appearance.hits],
          ["Walks + HBP", appearance.walks], ["Avg. velocity", `${format(appearance.averageVelocity)} mph`],
          ["Opponent AVG", appearance.average === null ? "—" : appearance.average.toFixed(3).replace(/^0/, "")],
          ["Opponent SLG", appearance.slugging === null ? "—" : appearance.slugging.toFixed(3).replace(/^0/, "")]
        ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("")}
      </div>
      <section class="panel content-section game-detail-arsenal">
        <p class="eyebrow eyebrow-dark">PITCH MIX</p><h2>Arsenal in this appearance</h2>
        <div class="table-wrap">${pitchTable(types)}</div>
      </section>
      <p class="table-note">ERA, earned runs and decisions are not available in the pitch dataset. IP and role are estimates; baserunning outs may be missing.</p>`;
  }

  const glossaryTerms = [
    { term: "Strikeout", category: "Results", definition: "A plate appearance that ends with the batter striking out. The app counts this from the terminal pitch’s event.", interpretation: "More strikeouts mean more plate appearances ended this way—not necessarily a lower run total.", related: ["Strikeout rate", "Whiff rate"], start: true },
    { term: "Strikeout rate", category: "Results", definition: "Strikeouts divided by completed plate appearances ending with the selected pitch type.", interpretation: "Higher means a larger share of those tracked completed plate appearances ended in a strikeout. Check the number of completed plate appearances.", related: ["Strikeout", "Sample size"] },
    { term: "Whiff rate", category: "Pitch Quality", definition: "Tracked swings that miss divided by tracked swings for a pitch type.", interpretation: "Higher means more swings missed in this dataset. Always check the swing sample size.", related: ["Swing", "Sample size"], start: true, visual: "whiff" },
    { term: "Pitch movement", category: "Pitch Movement", definition: "Statcast movement values (pfx_x and pfx_z) describe horizontal and vertical pitch movement in the source coordinate system.", interpretation: "Movement is directional: positive and negative values indicate opposite directions. Compare like-handed perspectives and pitch types.", related: ["Horizontal movement", "Vertical movement"], start: true, visual: "movement" },
    { term: "Strike zone", category: "Pitch Movement", definition: "The dashboard’s approximate zone rectangle used to orient plate-location plots.", interpretation: "It is a visual reference, not a called-strike probability or umpire-specific zone.", related: ["Plate location"], visual: "zone" },
    { term: "Plate location", category: "Pitch Movement", definition: "The recorded horizontal and vertical location where a pitch crossed the plate, shown in feet.", interpretation: "Use batter handedness when comparing location patterns.", related: ["Strike zone", "Batter handedness"] },
    { term: "Release velocity", category: "Pitch Quality", definition: "The pitch’s recorded release speed, displayed in miles per hour.", interpretation: "Higher means faster release speed; compare the same pitch type and similar samples.", related: ["Spin rate", "Sample size"] },
    { term: "Spin rate", category: "Pitch Quality", definition: "The recorded rotation rate of a pitch, displayed in revolutions per minute (rpm).", interpretation: "Higher is not automatically better; its effect depends on pitch type, movement and location.", related: ["Pitch movement"] },
    { term: "Opponent batting average", category: "Results", definition: "Hits divided by at-bats for tracked completed plate appearances ending on the selected pitch type.", interpretation: "Lower means fewer hits per at-bat in the available sample. Walks and some sacrifices aren’t at-bats.", related: ["Opponent slugging", "Sample size"] },
    { term: "Opponent slugging", category: "Results", definition: "Total bases divided by at-bats for tracked completed plate appearances ending on the selected pitch type.", interpretation: "Lower means fewer total bases per at-bat in the sample.", related: ["Opponent batting average", "Sample size"] },
    { term: "Usage", category: "Usage", definition: "The share of a pitcher’s tracked pitches that are a given pitch type.", interpretation: "Higher means the pitch was thrown more often in this data—not that it was more effective.", related: ["Pitch count", "Sample size"] },
    { term: "Pitch count", category: "Usage", definition: "The number of tracked pitches thrown by a pitcher or of a given pitch type.", interpretation: "Larger samples generally make observed rates more stable, but do not eliminate context.", related: ["Usage", "Sample size"] },
    { term: "Sample size", category: "Usage", definition: "The number of tracked pitches, swings, or completed at-bats behind a displayed metric.", interpretation: "Small samples can produce volatile rates. Check the denominator before comparing.", related: ["Whiff rate", "Opponent batting average"] },
    { term: "Batter handedness", category: "Usage", definition: "Whether the batter is recorded as right-handed (R) or left-handed (L).", interpretation: "Location and outcomes can differ by matchup; use the handedness filters to separate them.", related: ["Plate location"] },
    { term: "Swing", category: "Pitch Quality", definition: "A tracked swing at a pitch. The dashboard identifies swing and miss events from the pitch description.", interpretation: "Whiff rate uses tracked swings as its denominator.", related: ["Whiff rate", "Sample size"] },
    { term: "Innings pitched (estimated)", category: "Usage", definition: "The Game Log estimates innings from recorded outs, showing each out as one third of an inning.", interpretation: "This is derived from available pitch events and may differ from an official box score.", related: ["Strikeout"] },
    { term: "Starter / reliever (inferred)", category: "Usage", definition: "The Game Log labels the first Phillies pitcher appearing in tracked game data as the starter; subsequent pitchers are relievers.", interpretation: "This is an appearance-order inference because the payload doesn’t include an explicit role field.", related: ["Pitch count", "Innings pitched (estimated)"] }
  ];

  function glossaryVisual(visual) {
    if (visual === "whiff") return `<div class="glossary-mini-whiff" aria-label="Illustration of a swing missing a pitch"><span>BAT</span><i></i><b></b><small>miss</small></div>`;
    if (visual === "movement") return `<div class="glossary-mini-movement" aria-label="Illustration of horizontal and vertical pitch movement"><span>·</span><i>↗</i><small>H movement</small><b>V movement</b></div>`;
    if (visual === "zone") return `<div class="glossary-mini-zone" aria-label="Illustration of the approximate strike zone"><i></i><span>PLATE</span></div>`;
    return "";
  }

  function renderGlossary() {
    const featured = document.querySelector("#glossary-featured");
    const categoryContainer = document.querySelector("#glossary-categories");
    const results = document.querySelector("#glossary-results");
    if (!featured || !categoryContainer || !results) return;
    const categories = ["All terms", ...new Set(glossaryTerms.map((item) => item.category))];
    let activeCategory = "All terms";
    featured.innerHTML = glossaryTerms.filter((item) => item.start).map((item) =>
      `<a class="glossary-feature-card" href="#term-${encodeURIComponent(item.term.toLowerCase().replaceAll(" ", "-"))}">
        <span>${item.category}</span><strong>${escapeHtml(item.term)}</strong><small>${escapeHtml(item.definition)}</small>
        ${glossaryVisual(item.visual)}
      </a>`
    ).join("");

    categoryContainer.innerHTML = categories.map((category, index) =>
      `<button class="category-chip${index === 0 ? " is-active" : ""}" type="button" aria-pressed="${index === 0}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    ).join("");

    const search = document.querySelector("#glossary-search");
    const renderResults = () => {
      const query = search.value.trim().toLowerCase();
      const filtered = glossaryTerms.filter((item) =>
        (activeCategory === "All terms" || item.category === activeCategory) &&
        (!query || `${item.term} ${item.definition} ${item.interpretation} ${item.related.join(" ")}`.toLowerCase().includes(query))
      );
      results.innerHTML = filtered.length ? filtered.map((item) => {
        const id = item.term.toLowerCase().replaceAll(" ", "-");
        const related = item.related.map((term) => {
          const relatedItem = glossaryTerms.find((entry) => entry.term === term);
          return relatedItem
            ? `<a href="#term-${encodeURIComponent(relatedItem.term.toLowerCase().replaceAll(" ", "-"))}">${escapeHtml(term)}</a>`
            : escapeHtml(term);
        }).join(" · ");
        return `<details class="glossary-term" id="term-${encodeURIComponent(id)}">
          <summary><span class="glossary-category">${escapeHtml(item.category)}</span><strong>${escapeHtml(item.term)}</strong><span class="glossary-expand" aria-hidden="true">+</span></summary>
          <div class="glossary-definition"><p>${escapeHtml(item.definition)}</p>
            ${item.interpretation ? `<p class="glossary-interpretation"><strong>How to read it</strong> ${escapeHtml(item.interpretation)}</p>` : ""}
            ${item.visual ? glossaryVisual(item.visual) : ""}
            <p class="glossary-related"><strong>Related:</strong> ${related}</p>
          </div>
        </details>`;
      }).join("") : `<p class="empty-message">No terms match your search. Try another word or category.</p>`;
    };
    categoryContainer.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.category;
        categoryContainer.querySelectorAll("button").forEach((chip) => {
          const active = chip === button;
          chip.classList.toggle("is-active", active);
          chip.setAttribute("aria-pressed", String(active));
        });
        renderResults();
      });
    });
    search.addEventListener("input", renderResults);
    renderResults();
  }

  async function start() {
    renderGlossary();
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
      renderGameLog(rows);
      renderGameDetail(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The pitch data could not be loaded.";
      for (const selector of [
        "#home-pitchers", "#all-pitchers", "#pitcher-profile", "#comparison-summary",
        "#comparison-movement", "#comparison-trends", "#comparison-location-right",
        "#comparison-location-left", "#comparison-takeaway", "#opponent-list", "#opponent-chart",
        "#game-log-table", "#game-detail"
      ]) {
        const element = document.querySelector(selector);
        if (element) showError(element, message);
      }
      const gameLogStatus = document.querySelector("#game-log-status");
      if (gameLogStatus) gameLogStatus.textContent = message;
    }
  }

  start();
})();
