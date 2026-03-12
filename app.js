// ============================================================
// HDB Lease Buyback Scheme (LBS) Calculator
// Based on T&C effective from 1 Jan 2026 (Dec 2025 T&C document)
// ============================================================

// --- Bala's Table (Lease Depreciation Curve) ---
// Official per-year values from Singapore Land Authority.
// Codified in the 7th Schedule of the Land Betterment Charge
// (Table of Rates and Valuation Method) Regulations 2022.
// Source: SLA, confirmed by SMU International Real Estate Review (2025).
const BALAS_TABLE = {
  0: 0,
  1: 3.8, 2: 7.5, 3: 10.9, 4: 14.1, 5: 17.1,
  6: 19.9, 7: 22.7, 8: 25.2, 9: 27.7, 10: 30.0,
  11: 32.2, 12: 34.3, 13: 36.3, 14: 38.2, 15: 40.0,
  16: 41.8, 17: 43.4, 18: 45.0, 19: 46.6, 20: 48.0,
  21: 49.5, 22: 50.8, 23: 52.1, 24: 53.4, 25: 54.6,
  26: 55.8, 27: 56.9, 28: 58.0, 29: 59.0, 30: 60.0,
  31: 61.0, 32: 61.9, 33: 62.8, 34: 63.7, 35: 64.6,
  36: 65.4, 37: 66.2, 38: 67.0, 39: 67.7, 40: 68.5,
  41: 69.2, 42: 69.8, 43: 70.5, 44: 71.2, 45: 71.8,
  46: 72.4, 47: 73.0, 48: 73.6, 49: 74.1, 50: 74.7,
  51: 75.2, 52: 75.7, 53: 76.2, 54: 76.7, 55: 77.3,
  56: 77.9, 57: 78.5, 58: 79.0, 59: 79.5, 60: 80.0,
  61: 80.6, 62: 81.2, 63: 81.8, 64: 82.4, 65: 83.0,
  66: 83.6, 67: 84.2, 68: 84.5, 69: 85.4, 70: 86.0,
  71: 86.5, 72: 87.0, 73: 87.5, 74: 88.0, 75: 88.5,
  76: 89.0, 77: 89.5, 78: 90.0, 79: 90.5, 80: 91.0,
  81: 91.4, 82: 91.8, 83: 92.2, 84: 92.6, 85: 92.9,
  86: 93.3, 87: 93.6, 88: 94.0, 89: 94.3, 90: 94.6,
  91: 94.8, 92: 95.0, 93: 95.2, 94: 95.4, 95: 95.6,
  96: 95.7, 97: 95.8, 98: 95.9, 99: 96.0
};

function getLeaseValue(years) {
  if (years <= 0) return 0;
  if (years >= 99) return BALAS_TABLE[99];

  const floored = Math.floor(years);
  const frac = years - floored;
  if (frac === 0) return BALAS_TABLE[floored];

  // Interpolate for fractional years
  const lower = BALAS_TABLE[floored] || 0;
  const upper = BALAS_TABLE[floored + 1] || lower;
  return lower + frac * (upper - lower);
}

function calculateGrossProceeds(marketValue, remainingLease, retainedLease) {
  const currentFactor = getLeaseValue(remainingLease);
  const retainedFactor = getLeaseValue(retainedLease);
  if (currentFactor === 0) return 0;
  return marketValue * (currentFactor - retainedFactor) / currentFactor;
}

// --- CPF Retirement Sum Requirements (T&C 2.2a) ---
// For applications submitted from 1 Jan 2026 to 31 Dec 2026
const FRS_BY_AGE = { // Full Retirement Sum (sole owner requirement)
  "65-69": 220400,
  "70-79": 210400,
  "80+": 200400
};
const BRS_BY_AGE = { // Basic Retirement Sum (2+ owners requirement)
  "65-69": 110200,
  "70-79": 105200,
  "80+": 100200
};

function getAgeBand(age) {
  if (age >= 80) return "80+";
  if (age >= 70) return "70-79";
  return "65-69";
}

function getTopUpRequirement(age, numOwners) {
  const band = getAgeBand(age);
  return numOwners === 1 ? FRS_BY_AGE[band] : BRS_BY_AGE[band];
}

function getFRS(age) {
  return FRS_BY_AGE[getAgeBand(age)];
}

// --- LBS Bonus (T&C 2.5) ---
const MAX_BONUS = { "3room": 30000, "4room": 15000, "5room": 7500 };
const BONUS_RATIO = { "3room": 2, "4room": 4, "5room": 8 };

function calculateBonus(flatType, totalTopUp) {
  if (totalTopUp <= 0) return 0;
  if (totalTopUp >= 60000) return MAX_BONUS[flatType];
  return Math.min(totalTopUp / BONUS_RATIO[flatType], MAX_BONUS[flatType]);
}

// --- Lease Retention Options ---
// Minimum lease must cover youngest owner to at least age 95.
// Options in 5-year increments from the HDB minimum up to 35 years.
function getLeaseOptions(youngestAge) {
  // HDB minimums by age bracket
  let minYears;
  if (youngestAge >= 80) minYears = 15;
  else if (youngestAge >= 75) minYears = 20;
  else if (youngestAge >= 70) minYears = 25;
  else minYears = 30; // 65-69

  const options = [];
  for (let y = minYears; y <= 99; y += 5) {
    options.push(y);
  }
  return options;
}

// --- CPF LIFE Monthly Payout Estimate ---
// Based on CPF LIFE Standard Plan payout examples (CPF Board, 2025/2026).
// Reference: CPF LIFE Payout Examples PDF from cpf.gov.sg
// 2026 BRS $110,200 -> ~$950/mo, FRS $220,400 -> ~$1,780/mo at age 65.
// Deferring payouts past 65 increases them by ~7% per year (up to age 70).
// These are estimates only — actual payouts depend on individual circumstances.
function estimateMonthlyPayout(raBalance, age) {
  if (raBalance < 60000) return null; // Not eligible (T&C 2.4b)
  if (age >= 80) return null; // Not eligible (T&C 2.4e)

  // Base payout rate at age 65: derived from CPF examples
  // BRS $110,200 -> $950/mo = $8.62 per $1,000
  // FRS $220,400 -> $1,780/mo = $8.08 per $1,000
  // Use a sliding scale: higher RA -> slightly lower rate per $1,000 (diminishing returns)
  let baseRate;
  if (raBalance <= 110200) {
    baseRate = 8.62; // BRS-level rate
  } else if (raBalance <= 220400) {
    // Interpolate between BRS rate and FRS rate
    const t = (raBalance - 110200) / (220400 - 110200);
    baseRate = 8.62 - t * (8.62 - 8.08);
  } else {
    baseRate = 8.08; // FRS+ rate
  }

  // Deferral bonus: ~7% increase per year deferred past 65, up to age 70
  let deferralMultiplier = 1.0;
  if (age > 65) {
    const deferYears = Math.min(age - 65, 5);
    deferralMultiplier = Math.pow(1.07, deferYears);
  }

  return (raBalance / 1000) * baseRate * deferralMultiplier;
}

// --- Retirement Sum Scheme estimate for 80+ ---
// Simple estimate: RA balance / expected payout years / 12
function estimateRSSPayout(raBalance, age) {
  if (raBalance <= 0) return null;
  // Rough estimate: payouts last ~10 years for someone aged 80
  const yearsRemaining = Math.max(95 - age, 5);
  return raBalance / yearsRemaining / 12;
}

// --- Draw Lease Timeline Chart ---
function drawBalasChart(remainingLease, retainedLease, marketValue, grossProceeds) {
  const canvas = document.getElementById("balas-chart");
  const dpr = window.devicePixelRatio || 1;
  const displayW = canvas.parentElement.clientWidth;
  const displayH = 150;
  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width = displayW + "px";
  canvas.style.height = displayH + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const tailYears = remainingLease - retainedLease;
  const retainedFactor = getLeaseValue(retainedLease);
  const remainingFactor = getLeaseValue(remainingLease);

  // ==============================
  // Timeline Bar
  // Shows the lease from NOW into the future
  // ==============================
  const barTop = 16;
  const barH = 52;
  const barLeft = 20;
  const barRight = displayW - 20;
  const barW = barRight - barLeft;

  // Proportions
  const retainPct = retainedLease / remainingLease;
  const retainW = barW * retainPct;
  const soldW = barW * (1 - retainPct);

  // "You keep" portion (blue)
  ctx.fillStyle = "#2980b9";
  ctx.beginPath();
  ctx.roundRect(barLeft, barTop, retainW, barH, [6, 0, 0, 6]);
  ctx.fill();

  // "Sold to HDB" tail-end (red)
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.roundRect(barLeft + retainW, barTop, soldW, barH, [0, 6, 6, 0]);
  ctx.fill();

  // Labels on the bar
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 16px -apple-system, sans-serif";

  if (retainW > 100) {
    ctx.fillText(`You keep: ${retainedLease} yr`, barLeft + retainW / 2, barTop + barH / 2 - 6);
    ctx.font = "14px -apple-system, sans-serif";
    ctx.fillText("(near-term)", barLeft + retainW / 2, barTop + barH / 2 + 12);
  } else if (retainW > 50) {
    ctx.font = "bold 14px -apple-system, sans-serif";
    ctx.fillText(`Keep ${retainedLease}yr`, barLeft + retainW / 2, barTop + barH / 2 + 5);
  }

  ctx.font = "bold 16px -apple-system, sans-serif";
  if (soldW > 120) {
    ctx.fillText(`Sold to HDB: ${tailYears} yr tail-end`, barLeft + retainW + soldW / 2, barTop + barH / 2 - 6);
    ctx.font = "14px -apple-system, sans-serif";
    ctx.fillText(fmt(grossProceeds), barLeft + retainW + soldW / 2, barTop + barH / 2 + 12);
  } else if (soldW > 60) {
    ctx.font = "bold 14px -apple-system, sans-serif";
    ctx.fillText(`Sell ${tailYears}yr`, barLeft + retainW + soldW / 2, barTop + barH / 2 - 4);
    ctx.font = "13px -apple-system, sans-serif";
    ctx.fillText(fmt(grossProceeds), barLeft + retainW + soldW / 2, barTop + barH / 2 + 12);
  }

  // Timeline labels below bar
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 15px -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Now", barLeft, barTop + barH + 20);
  ctx.textAlign = "center";
  ctx.fillText(`Year ${retainedLease}`, barLeft + retainW, barTop + barH + 20);
  ctx.textAlign = "right";
  ctx.fillText(`Year ${remainingLease}`, barRight, barTop + barH + 20);

  // Divider line
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barLeft + retainW, barTop);
  ctx.lineTo(barLeft + retainW, barTop + barH);
  ctx.stroke();

  // Explanation text below
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "15px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `The last ${tailYears} years of your ${remainingLease}-year lease are sold to HDB.`,
    displayW / 2, barTop + barH + 44
  );
}

// --- Format currency ---
function fmt(amount) {
  if (amount === null || amount === undefined) return "N/A";
  return "$" + Math.round(amount).toLocaleString("en-SG");
}

// --- DOM Setup ---
const form = document.getElementById("lbs-form");
const numOwnersSelect = document.getElementById("num-owners");
const owner2Section = document.getElementById("owner-2-section");
const holdingField = document.getElementById("holding-field");
const ticShareField = document.getElementById("tic-share-field");
const mannerHoldingSelect = document.getElementById("manner-holding");
const leaseRetainSelect = document.getElementById("lease-retain");
const resultsSection = document.getElementById("results");

// --- Toggle Owner 2 & holding fields ---
numOwnersSelect.addEventListener("change", () => {
  const show = numOwnersSelect.value === "2";
  owner2Section.classList.toggle("hidden", !show);
  holdingField.classList.toggle("hidden", !show);
  ticShareField.classList.toggle("hidden", !show || mannerHoldingSelect.value !== "tic");

  const owner2Inputs = owner2Section.querySelectorAll("input");
  owner2Inputs.forEach(input => {
    input.required = show;
    if (!show) input.value = "";
  });
  updateLeaseOptions();
});

mannerHoldingSelect.addEventListener("change", () => {
  ticShareField.classList.toggle("hidden", mannerHoldingSelect.value !== "tic");
});

// --- Update lease options on age or remaining lease change ---
document.getElementById("owner-1-age").addEventListener("input", updateLeaseOptions);
document.getElementById("owner-2-age").addEventListener("input", updateLeaseOptions);
document.getElementById("remaining-lease").addEventListener("input", updateLeaseOptions);

function updateLeaseOptions() {
  const age1 = parseInt(document.getElementById("owner-1-age").value) || 0;
  const age2 = numOwnersSelect.value === "2"
    ? (parseInt(document.getElementById("owner-2-age").value) || 0)
    : 999;

  const youngestAge = Math.min(age1, age2);
  leaseRetainSelect.innerHTML = "";
  const hint = document.getElementById("lease-retain-hint");

  if (youngestAge < 65) {
    leaseRetainSelect.innerHTML = '<option value="">Enter owner age(s) first</option>';
    hint.textContent = "";
    return;
  }

  const remainingLease = parseInt(document.getElementById("remaining-lease").value) || 99;
  const allOptions = getLeaseOptions(youngestAge);
  // Must sell at least 20 years of tail-end lease, and retain less than remaining
  const maxRetain = remainingLease - 20;
  const options = allOptions.filter(y => y <= maxRetain);

  if (options.length === 0) {
    leaseRetainSelect.innerHTML = '<option value="">Remaining lease too short</option>';
    hint.textContent = "";
    return;
  }

  const minYears = options[0];
  const coveredUntilMin = youngestAge + minYears;

  options.forEach((years, i) => {
    const coveredUntil = youngestAge + years;
    const opt = document.createElement("option");
    opt.value = years;
    const label = i === 0
      ? `${years} years (minimum — covers until age ${coveredUntil})`
      : `${years} years (covers until age ${coveredUntil})`;
    opt.textContent = label;
    leaseRetainSelect.appendChild(opt);
  });

  hint.textContent = `Youngest owner is ${youngestAge}. Minimum ${minYears} years retained to cover until age ${coveredUntilMin}. Retaining more years = less sale proceeds but longer coverage.`;
}

// --- Helper to create result rows ---
function makeRow(label, value, className) {
  const row = document.createElement("div");
  row.className = "result-row";
  row.innerHTML = `<span>${label}</span><span class="result-value ${className || ''}">${value}</span>`;
  return row;
}

function makeNote(text) {
  const row = document.createElement("div");
  row.className = "result-note";
  row.textContent = text;
  return row;
}

// --- Main Calculation (T&C 2.1 - 2.5) ---
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const flatType = document.getElementById("flat-type").value;
  const marketValue = parseFloat(document.getElementById("market-value").value);
  const remainingLease = parseFloat(document.getElementById("remaining-lease").value);
  const outstandingLoan = parseFloat(document.getElementById("outstanding-loan").value) || 0;
  const upgradingCost = parseFloat(document.getElementById("upgrading-cost").value) || 0;
  const adminFees = parseFloat(document.getElementById("admin-fees").value) || 0;
  const numOwners = parseInt(numOwnersSelect.value);
  const retainedLease = parseInt(leaseRetainSelect.value);

  const owner1Age = parseInt(document.getElementById("owner-1-age").value);
  const owner1RA = parseFloat(document.getElementById("owner-1-ra").value);
  const owner1SC = document.getElementById("owner-1-citizenship").value === "sc";

  let owner2Age = null, owner2RA = null, owner2SC = false;
  if (numOwners === 2) {
    owner2Age = parseInt(document.getElementById("owner-2-age").value);
    owner2RA = parseFloat(document.getElementById("owner-2-ra").value);
    owner2SC = document.getElementById("owner-2-citizenship").value === "sc";
  }

  // Determine ownership shares (T&C 2.1, 7.1)
  let owner1Share = 1.0, owner2Share = 0.0;
  if (numOwners === 2) {
    if (mannerHoldingSelect.value === "tic") {
      owner1Share = (parseFloat(document.getElementById("owner-1-share").value) || 50) / 100;
      owner2Share = 1 - owner1Share;
    } else {
      owner1Share = 0.5;
      owner2Share = 0.5;
    }
  }

  if (retainedLease >= remainingLease) {
    alert("Retained lease must be shorter than the remaining lease on the flat.");
    return;
  }

  // ==========================================
  // STEP 1: Calculate gross & net proceeds
  // ==========================================
  const tailYears = remainingLease - retainedLease;
  const overrideProceeds = parseFloat(document.getElementById("override-proceeds").value);
  const balasEstimate = calculateGrossProceeds(marketValue, remainingLease, retainedLease);
  const grossProceeds = overrideProceeds > 0 ? overrideProceeds : balasEstimate;
  const usingOverride = overrideProceeds > 0;

  // HDB deducts outstanding payments (T&C 1.4c)
  const totalDeductions = outstandingLoan + upgradingCost + adminFees;
  const netProceeds = Math.max(grossProceeds - totalDeductions, 0);

  // ==========================================
  // STEP 2: Apportion net proceeds (T&C 2.1)
  // ==========================================
  const owner1Proceeds = netProceeds * owner1Share;
  const owner2Proceeds = netProceeds * owner2Share;

  // ==========================================
  // STEP 3: Initial RA top-up (T&C 2.2a-c)
  // Each owner tops up own RA to specified requirement
  // ==========================================
  const owner1Requirement = getTopUpRequirement(owner1Age, numOwners);
  const owner1Shortfall = Math.max(owner1Requirement - owner1RA, 0);
  // T&C 2.2b: if insufficient, use entire share; T&C 2.2c: if sufficient, top up to requirement
  const owner1InitialTopUp = Math.min(owner1Proceeds, owner1Shortfall);
  let owner1Remaining = owner1Proceeds - owner1InitialTopUp;

  let owner2Requirement = 0, owner2Shortfall = 0, owner2InitialTopUp = 0, owner2Remaining = 0;
  if (numOwners === 2) {
    owner2Requirement = getTopUpRequirement(owner2Age, numOwners);
    owner2Shortfall = Math.max(owner2Requirement - owner2RA, 0);
    owner2InitialTopUp = Math.min(owner2Proceeds, owner2Shortfall);
    owner2Remaining = owner2Proceeds - owner2InitialTopUp;
  }

  const totalInitialTopUp = owner1InitialTopUp + owner2InitialTopUp;

  // ==========================================
  // STEP 4: Cash & further top-up (T&C 2.2c-d, 2.3)
  // If combined remaining > $100k, excess goes to further RA top-up to FRS
  // ==========================================
  const combinedRemaining = owner1Remaining + owner2Remaining;

  let cashRetained, owner1FurtherTopUp = 0, owner2FurtherTopUp = 0;

  if (combinedRemaining <= 100000) {
    // All remaining is cash
    cashRetained = combinedRemaining;
  } else {
    // T&C 2.2d: excess over $100k goes to further RA top-up (each from own share)
    cashRetained = 100000;
    const excessTotal = combinedRemaining - 100000;

    // Each owner's excess proportional to their remaining proceeds
    if (combinedRemaining > 0) {
      const owner1ExcessShare = owner1Remaining / combinedRemaining;
      const owner2ExcessShare = numOwners === 2 ? owner2Remaining / combinedRemaining : 0;

      // Further top-up is to current FRS (T&C 2.2d)
      const owner1FRSGap = Math.max(getFRS(owner1Age) - (owner1RA + owner1InitialTopUp), 0);
      owner1FurtherTopUp = Math.min(excessTotal * owner1ExcessShare, owner1FRSGap);

      if (numOwners === 2) {
        const owner2FRSGap = Math.max(getFRS(owner2Age) - (owner2RA + owner2InitialTopUp), 0);
        owner2FurtherTopUp = Math.min(excessTotal * owner2ExcessShare, owner2FRSGap);
      }

      // Any amount that can't go to RA (already at FRS) stays as cash
      const actualFurtherTopUp = owner1FurtherTopUp + owner2FurtherTopUp;
      cashRetained = combinedRemaining - actualFurtherTopUp;
    }
  }

  const owner1TotalTopUp = owner1InitialTopUp + owner1FurtherTopUp;
  const owner2TotalTopUp = owner2InitialTopUp + owner2FurtherTopUp;
  const totalTopUp = owner1TotalTopUp + owner2TotalTopUp;

  // ==========================================
  // STEP 5: LBS Bonus (T&C 2.5)
  // ==========================================
  const bonus = calculateBonus(flatType, totalTopUp);

  // Bonus is cash (added to cash retained)
  const totalCash = cashRetained + bonus;

  // ==========================================
  // STEP 6: CPF LIFE / RSS estimates (T&C 2.4)
  // ==========================================
  const owner1FinalRA = owner1RA + owner1TotalTopUp;
  const owner2FinalRA = numOwners === 2 ? owner2RA + owner2TotalTopUp : 0;

  let owner1Monthly, owner1PayoutType;
  if (owner1Age >= 80) {
    owner1Monthly = estimateRSSPayout(owner1FinalRA, owner1Age);
    owner1PayoutType = "RSS";
  } else {
    owner1Monthly = estimateMonthlyPayout(owner1FinalRA, owner1Age);
    owner1PayoutType = owner1Monthly ? "CPF LIFE" : null;
  }

  let owner2Monthly = null, owner2PayoutType = null;
  if (numOwners === 2) {
    if (owner2Age >= 80) {
      owner2Monthly = estimateRSSPayout(owner2FinalRA, owner2Age);
      owner2PayoutType = "RSS";
    } else {
      owner2Monthly = estimateMonthlyPayout(owner2FinalRA, owner2Age);
      owner2PayoutType = owner2Monthly ? "CPF LIFE" : null;
    }
  }

  const totalMonthly = (owner1Monthly || 0) + (owner2Monthly || 0);

  // ==========================================
  // RENDER RESULTS
  // ==========================================
  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth" });

  // --- Bala's Curve Chart ---
  drawBalasChart(remainingLease, retainedLease, marketValue, grossProceeds);

  // --- Sale Proceeds ---
  document.getElementById("res-tail-years").textContent = `${tailYears} years`;

  // Show Bala's estimate vs override
  const balasRow = document.getElementById("res-balas-est-row");
  const proceedsNote = document.getElementById("res-proceeds-note");
  const proceedsLabel = document.getElementById("res-proceeds-label");

  document.getElementById("res-balas-est").textContent = fmt(balasEstimate);

  if (usingOverride) {
    balasRow.classList.remove("hidden");
    proceedsLabel.textContent = "HDB's quoted sale price (used)";
    proceedsNote.textContent = "";
  } else {
    balasRow.classList.add("hidden");
    proceedsLabel.textContent = "Gross sale proceeds (est.)";
    proceedsNote.textContent = "Estimated using Bala's Table. HDB's actual valuation may differ. If HDB has given you a price, enter it above for a more accurate calculation.";
  }

  document.getElementById("res-proceeds").textContent = fmt(grossProceeds);

  const showRow = (id, amount, label) => {
    const row = document.getElementById(id);
    if (amount > 0) {
      row.classList.remove("hidden");
      row.querySelector(".result-value").textContent = `-${fmt(amount)}`;
    } else {
      row.classList.add("hidden");
    }
  };
  showRow("res-loan-row", outstandingLoan);
  showRow("res-upgrading-row", upgradingCost);
  showRow("res-fees-row", adminFees);

  document.getElementById("res-net-proceeds").textContent = fmt(netProceeds);

  // --- Apportionment (for 2 owners) ---
  const apportionGroup = document.getElementById("res-apportion-group");
  const apportionDetails = document.getElementById("res-apportion-details");
  apportionDetails.innerHTML = "";

  if (numOwners === 2) {
    apportionGroup.classList.remove("hidden");
    const holdingDesc = mannerHoldingSelect.value === "tic"
      ? `Tenancy-in-Common (${Math.round(owner1Share * 100)}% / ${Math.round(owner2Share * 100)}%)`
      : "Joint Tenancy (50% / 50%)";
    apportionDetails.appendChild(makeNote(holdingDesc));
    apportionDetails.appendChild(makeRow("Owner 1's share", fmt(owner1Proceeds)));
    apportionDetails.appendChild(makeRow("Owner 2's share", fmt(owner2Proceeds)));
  } else {
    apportionGroup.classList.add("hidden");
  }

  // --- CPF RA Top-up ---
  const topupDetails = document.getElementById("res-topup-details");
  topupDetails.innerHTML = "";

  if (numOwners === 1) {
    topupDetails.appendChild(makeRow(
      `RA requirement (${getAgeBand(owner1Age)}, sole owner)`,
      fmt(owner1Requirement)
    ));
    topupDetails.appendChild(makeRow("Current RA balance", fmt(owner1RA)));
    topupDetails.appendChild(makeRow("Shortfall to requirement", fmt(owner1Shortfall)));
    topupDetails.appendChild(makeRow("Initial RA top-up", fmt(owner1InitialTopUp), "highlight"));
    if (owner1FurtherTopUp > 0) {
      topupDetails.appendChild(makeRow("Further top-up to FRS (excess > $100k)", fmt(owner1FurtherTopUp)));
    }
  } else {
    // Owner 1
    topupDetails.appendChild(makeNote(`Owner 1 (age ${owner1Age})`));
    topupDetails.appendChild(makeRow(
      `  RA requirement (BRS, ${getAgeBand(owner1Age)})`,
      fmt(owner1Requirement)
    ));
    topupDetails.appendChild(makeRow("  Current RA", fmt(owner1RA)));
    topupDetails.appendChild(makeRow("  Shortfall", fmt(owner1Shortfall)));
    topupDetails.appendChild(makeRow("  Initial top-up", fmt(owner1InitialTopUp), "highlight"));
    if (owner1FurtherTopUp > 0) {
      topupDetails.appendChild(makeRow("  Further top-up to FRS", fmt(owner1FurtherTopUp)));
    }

    // Owner 2
    topupDetails.appendChild(makeNote(`Owner 2 (age ${owner2Age})`));
    topupDetails.appendChild(makeRow(
      `  RA requirement (BRS, ${getAgeBand(owner2Age)})`,
      fmt(owner2Requirement)
    ));
    topupDetails.appendChild(makeRow("  Current RA", fmt(owner2RA)));
    topupDetails.appendChild(makeRow("  Shortfall", fmt(owner2Shortfall)));
    topupDetails.appendChild(makeRow("  Initial top-up", fmt(owner2InitialTopUp), "highlight"));
    if (owner2FurtherTopUp > 0) {
      topupDetails.appendChild(makeRow("  Further top-up to FRS", fmt(owner2FurtherTopUp)));
    }
  }

  document.getElementById("res-total-topup").textContent = fmt(totalTopUp);

  // --- LBS Bonus ---
  document.getElementById("res-bonus").textContent = fmt(bonus);
  let bonusNote;
  if (totalTopUp <= 0) {
    bonusNote = "No bonus — all owners already at FRS prior to LBS (T&C 2.5)";
  } else if (totalTopUp >= 60000) {
    bonusNote = `Full bonus (total RA top-up ${fmt(totalTopUp)} >= $60,000)`;
  } else {
    const ratioDesc = `$1 per $${BONUS_RATIO[flatType]} top-up`;
    bonusNote = `Pro-rated (${ratioDesc}), total top-up ${fmt(totalTopUp)} < $60,000`;
  }
  document.getElementById("res-bonus-note").textContent = bonusNote;

  if (!owner1SC && !owner2SC) {
    document.getElementById("res-bonus-note").textContent += " | Note: LBS bonus shared among SC owners/spouses only";
  }

  // --- Cash ---
  document.getElementById("res-cash").textContent = fmt(totalCash);
  const cashNote = document.getElementById("res-cash-note");
  if (numOwners === 2) {
    const holdingType = mannerHoldingSelect.value === "tic"
      ? "separate cheques based on respective shares"
      : "single cheque in joint names";
    cashNote.textContent = `Disbursed as ${holdingType} (T&C 2.3)`;
  } else {
    cashNote.textContent = "";
  }

  // --- CPF LIFE / RSS ---
  const cpfLifeDetails = document.getElementById("res-cpf-life-details");
  cpfLifeDetails.innerHTML = "";

  function renderOwnerPayout(label, finalRA, age, monthly, payoutType) {
    cpfLifeDetails.appendChild(makeRow(`${label} final RA (after top-up)`, fmt(finalRA)));
    if (payoutType === "CPF LIFE") {
      cpfLifeDetails.appendChild(makeRow(`${label} CPF LIFE payout (est.)`, `~${fmt(monthly)}/mo`, "highlight"));
      cpfLifeDetails.appendChild(makeNote(`Entire RA used as CPF LIFE premium (T&C 2.4b)`));
    } else if (payoutType === "RSS") {
      cpfLifeDetails.appendChild(makeRow(`${label} RSS payout (est.)`, `~${fmt(monthly)}/mo`, "highlight"));
      cpfLifeDetails.appendChild(makeNote(`Aged 80+: monthly payouts under Retirement Sum Scheme until RA depleted (T&C 2.4e)`));
    } else {
      if (age >= 80) {
        cpfLifeDetails.appendChild(makeNote(`${label}: Not eligible for CPF LIFE (aged 80+). Will receive RSS payouts.`));
      } else {
        cpfLifeDetails.appendChild(makeNote(`${label}: RA below $60,000 after top-up — not eligible for CPF LIFE`));
      }
    }
  }

  if (numOwners === 1) {
    renderOwnerPayout("Owner", owner1FinalRA, owner1Age, owner1Monthly, owner1PayoutType);
  } else {
    renderOwnerPayout("Owner 1", owner1FinalRA, owner1Age, owner1Monthly, owner1PayoutType);
    renderOwnerPayout("Owner 2", owner2FinalRA, owner2Age, owner2Monthly, owner2PayoutType);
  }

  // --- Summary ---
  document.getElementById("res-summary-cash").textContent = fmt(totalCash);
  document.getElementById("res-summary-cpf").textContent = fmt(totalTopUp);

  const summaryMonthlyRow = document.getElementById("res-summary-monthly-row");
  if (totalMonthly > 0) {
    summaryMonthlyRow.classList.remove("hidden");
    document.getElementById("res-summary-monthly").textContent = `~${fmt(totalMonthly)}/mo`;
  } else {
    summaryMonthlyRow.classList.add("hidden");
  }
});

// ============================================================
// localStorage: save & restore form values across refreshes
// ============================================================
const STORAGE_KEY = "lbs-calculator-form";
const FORM_FIELD_IDS = [
  "flat-type", "market-value", "remaining-lease", "override-proceeds",
  "outstanding-loan", "upgrading-cost", "admin-fees",
  "num-owners", "manner-holding", "owner-1-share",
  "owner-1-age", "owner-1-citizenship", "owner-1-ra",
  "owner-2-age", "owner-2-citizenship", "owner-2-ra",
  "lease-retain"
];

function saveForm() {
  const data = {};
  FORM_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[id] = el.value;
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
}

function restoreForm() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
  if (!data) return;

  // Restore num-owners first so owner 2 fields get shown
  if (data["num-owners"]) {
    numOwnersSelect.value = data["num-owners"];
    numOwnersSelect.dispatchEvent(new Event("change"));
  }

  // Restore manner of holding
  if (data["manner-holding"]) {
    mannerHoldingSelect.value = data["manner-holding"];
    mannerHoldingSelect.dispatchEvent(new Event("change"));
  }

  // Restore all other fields
  FORM_FIELD_IDS.forEach(id => {
    if (id === "num-owners" || id === "manner-holding" || id === "lease-retain") return;
    const el = document.getElementById(id);
    if (el && data[id] !== undefined && data[id] !== "") {
      el.value = data[id];
    }
  });

  // Trigger lease options update (depends on ages + remaining lease)
  updateLeaseOptions();

  // Restore lease-retain after options are populated
  if (data["lease-retain"]) {
    const retainEl = document.getElementById("lease-retain");
    // Check if the saved value exists as an option
    const opts = Array.from(retainEl.options).map(o => o.value);
    if (opts.includes(data["lease-retain"])) {
      retainEl.value = data["lease-retain"];
    }
  }
}

// Save on every input/change
form.addEventListener("input", saveForm);
form.addEventListener("change", saveForm);

// Restore on page load
restoreForm();
