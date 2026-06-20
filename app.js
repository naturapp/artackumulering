(function () {
  "use strict";

  const STORAGE_KEY = "artackumulering_plots_v1";

  // ---------- Datamodell ----------
  // plots: { [plotId]: { name, createdAt, findings: [{sec}] } }
  let plots = loadPlots();
  let currentPlotId = Object.keys(plots)[0] || createPlot("Provyta 1");
  let timerInterval = null;

  function loadPlots() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Kunde inte läsa sparad data:", e);
    }
    return {};
  }

  function savePlots() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plots));
    } catch (e) {
      console.warn("Kunde inte spara data:", e);
    }
  }

  function createPlot(name) {
    const id = "plot_" + Date.now();
    plots[id] = { name: name, createdAt: Date.now(), findings: [] };
    savePlots();
    return id;
  }

  function currentPlot() {
    return plots[currentPlotId];
  }

  // ---------- UI-referenser ----------
  const els = {
    plotSelect: document.getElementById("plot-select"),
    statCount: document.getElementById("stat-count"),
    statTime: document.getElementById("stat-time"),
    statLast: document.getElementById("stat-last"),
    statRate: document.getElementById("stat-rate"),
    status: document.getElementById("status"),
    bigBtn: document.getElementById("big-btn"),
    undoBtn: document.getElementById("undo-btn"),
    resetBtn: document.getElementById("reset-btn"),
    newPlotBtn: document.getElementById("new-plot-btn"),
  };

  // ---------- Charts ----------
  const isDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const lineColor = isDark ? "#5DCAA5" : "#0F6E56";
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const tickColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";

  function commonAxes(yLabel) {
    return {
      x: {
        type: "linear",
        title: { display: true, text: "Tid (min)", color: tickColor, font: { size: 11 } },
        ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 8, callback: (v) => v.toFixed(1) },
        grid: { color: gridColor },
        min: 0,
      },
      y: {
        title: { display: true, text: yLabel, color: tickColor, font: { size: 11 } },
        ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 6, callback: (v) => (Number.isInteger(v) ? v : "") },
        grid: { color: gridColor },
        min: 0,
      },
    };
  }

  const accChart = new Chart(document.getElementById("accChart"), {
    type: "line",
    data: {
      datasets: [
        {
          label: "Arter",
          data: [],
          borderColor: lineColor,
          backgroundColor: lineColor + "22",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: lineColor,
          borderWidth: 2,
          stepped: "before",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: { legend: { display: false } },
      scales: commonAxes("Antal arter"),
    },
  });

  // ---------- Hjälpfunktioner ----------
  function fmtMinSec(sec) {
    if (sec < 60) return Math.round(sec) + "s";
    return (sec / 60).toFixed(1) + " min";
  }

  function refreshPlotSelect() {
    els.plotSelect.innerHTML = "";
    Object.keys(plots)
      .sort((a, b) => plots[a].createdAt - plots[b].createdAt)
      .forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = plots[id].name;
        if (id === currentPlotId) opt.selected = true;
        els.plotSelect.appendChild(opt);
      });
  }

  function rebuildChart() {
    const findings = currentPlot().findings;
    const accData = findings.map((f, i) => ({ x: parseFloat((f.sec / 60).toFixed(3)), y: i + 1 }));
    if (accData.length > 0) accData.unshift({ x: 0, y: 0 });

    accChart.data.datasets[0].data = accData;
    accChart.update("none");
  }

  let startTime = null;

  function tickClock() {
    if (!startTime) return;
    const elapsed = (Date.now() - startTime) / 1000;
    els.statTime.innerHTML =
      elapsed < 60
        ? Math.round(elapsed) + '<span class="stat-unit">s</span>'
        : (elapsed / 60).toFixed(1) + '<span class="stat-unit">min</span>';
  }

  function addFinding() {
    const plot = currentPlot();
    if (!startTime) {
      startTime = Date.now();
      timerInterval = setInterval(tickClock, 1000);
      els.status.textContent = "Inventering pågår…";
    }
    const sec = (Date.now() - startTime) / 1000;
    plot.findings.push({ sec: sec });
    savePlots();
    rebuildChart();
    updateStatsSimple();

    const n = plot.findings.length;
    if (n === 1) els.status.textContent = "Första fyndet! Bra start.";
    else if (n >= 10) {
      const dt = plot.findings[n - 1].sec - plot.findings[n - 2].sec;
      const dtFirst = plot.findings[1].sec - plot.findings[0].sec;
      els.status.textContent =
        dt > dtFirst * 4 ? `Intervallen ökar – kurvan planar ut. Art ${n}.` : `Art ${n} noterad.`;
    } else {
      els.status.textContent = `Art ${n} noterad.`;
    }
  }

  // Enklare statsfunktion som inte beror på _startRef-hacket ovan
  function updateStatsSimple() {
    const findings = currentPlot().findings;
    const n = findings.length;
    els.statCount.textContent = n;

    if (n >= 2) {
      const last = findings[n - 1].sec - findings[n - 2].sec;
      els.statLast.textContent = fmtMinSec(last);
    } else if (n === 1) {
      els.statLast.textContent = fmtMinSec(findings[0].sec);
    } else {
      els.statLast.textContent = "–";
    }

    if (n >= 2) {
      const windowSize = Math.min(3, n - 1);
      const recent = findings.slice(-(windowSize + 1));
      const dt = (recent[recent.length - 1].sec - recent[0].sec) / 60;
      const rate = dt > 0 ? (windowSize / dt).toFixed(2) : "–";
      els.statRate.textContent = rate;
    } else {
      els.statRate.textContent = "–";
    }
  }

  function undoLast() {
    const plot = currentPlot();
    if (plot.findings.length === 0) return;
    plot.findings.pop();
    savePlots();
    if (plot.findings.length === 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      startTime = null;
      els.statTime.innerHTML = '0<span class="stat-unit">min</span>';
      els.status.textContent = "Tryck på knappen för att starta inventeringen.";
    }
    rebuildChart();
    updateStatsSimple();
  }

  function resetCurrentPlot() {
    const plot = currentPlot();
    if (plot.findings.length === 0) return;
    if (!confirm(`Rensa all data för "${plot.name}"? Detta går inte att ångra.`)) return;
    clearInterval(timerInterval);
    timerInterval = null;
    startTime = null;
    plot.findings = [];
    savePlots();
    rebuildChart();
    els.statCount.textContent = "0";
    els.statTime.innerHTML = '0<span class="stat-unit">min</span>';
    els.statLast.textContent = "–";
    els.statRate.textContent = "–";
    els.status.textContent = "Tryck på knappen för att starta inventeringen.";
  }

  function newPlot() {
    const num = Object.keys(plots).length + 1;
    const name = prompt("Namn på ny provyta:", "Provyta " + num);
    if (!name) return;
    const id = createPlot(name);
    switchPlot(id);
  }

  function switchPlot(id) {
    clearInterval(timerInterval);
    timerInterval = null;
    startTime = null;
    currentPlotId = id;
    refreshPlotSelect();
    rebuildChart();
    updateStatsSimple();
    els.statTime.innerHTML = '0<span class="stat-unit">min</span>';
    els.status.textContent =
      currentPlot().findings.length > 0
        ? "Provyta laddad. Tryck för att fortsätta logga."
        : "Tryck på knappen för att starta inventeringen.";
  }

  // ---------- Init ----------
  refreshPlotSelect();
  rebuildChart();
  updateStatsSimple();

  els.bigBtn.addEventListener("click", addFinding);
  els.undoBtn.addEventListener("click", undoLast);
  els.resetBtn.addEventListener("click", resetCurrentPlot);
  els.newPlotBtn.addEventListener("click", newPlot);
  els.plotSelect.addEventListener("change", (e) => switchPlot(e.target.value));

  // ---------- PWA install-knapp ----------
  let deferredPrompt = null;
  const banner = document.getElementById("install-banner");
  const installBtn = document.getElementById("install-btn");
  const installText = document.getElementById("install-text");

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  function showManualInstallBanner() {
    if (isStandalone) return;
    installText.textContent = isIos
      ? "Lägg till på hemskärmen: tryck på Dela-ikonen och välj \"Lägg till på hemskärmen\""
      : "Installera som app: öppna webbläsarmenyn (⋮) och välj \"Installera app\" eller \"Lägg till på hemskärmen\"";
    installBtn.style.display = "none";
    banner.style.display = "flex";
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installText.textContent = "Installera som app på hemskärmen";
    installBtn.style.display = "inline-block";
    banner.style.display = "flex";
  });

  // Om webbläsaren inte skickar beforeinstallprompt (redan tillfrågad tidigare,
  // eller webbläsare utan stöd som Safari), visa ändå banner med manuella instruktioner
  setTimeout(() => {
    if (!deferredPrompt && !isStandalone) showManualInstallBanner();
  }, 2000);

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.style.display = "none";
  });

  window.addEventListener("appinstalled", () => {
    banner.style.display = "none";
  });

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((err) => {
        console.warn("Service worker-registrering misslyckades:", err);
      });
    });
  }
})();
