// ============================================================
// HDB Lease Buyback Scheme (LBS) Calculator
// Based on T&C effective from 1 Jan 2026 (Dec 2025 T&C document)
// ============================================================

// --- Bala's Table (Lease Depreciation Curve) ---
// Maps remaining lease years to percentage of freehold value.
// Used to estimate the value of the tail-end lease sold to HDB.
const BALAS_TABLE = {
  0: 0, 5: 7, 10: 15, 15: 24, 20: 33, 25: 41,
  30: 49, 35: 56, 40: 63, 45: 69, 50: 74,
  55: 78, 60: 82, 65: 85, 70: 88, 75: 90,
  80: 91, 85: 93, 90: 95, 95: 97, 99: 99
};

function getLeaseValue(years) {
  if (years <= 0) return 0;
  if (years >= 99) return 99;

  const keys = Object.keys(BALAS_TABLE).map(Number).sort((a, b) => a - b);
  let lower = 0, upper = 99;
  for (let i = 0; i < keys.length - 1; i++) {
    if (years >= keys[i] && years <= keys[i + 1]) {
      lower = keys[i];
      upper = keys[i + 1];
      break;
    }
  }

  const lowerVal = BALAS_TABLE[lower];
  const upperVal = BALAS_TABLE[upper];
  const ratio = (years - lower) / (upper - lower);
  return lowerVal + ratio * (upperVal - lowerVal);
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
function getLeaseOptions(youngestAge) {
  if (youngestAge >= 80) return [15, 20, 25, 30, 35];
  if (youngestAge >= 75) return [20, 25, 30, 35];
  if (youngestAge >= 70) return [25, 30, 35];
  return [30, 35]; // 65-69
}

// --- CPF LIFE Monthly Payout Estimate ---
// Rough estimates based on CPF LIFE Standard Plan.
// Actual payouts depend on many factors.
function estimateMonthlyPayout(raBalance, age) {
  if (raBalance < 60000) return null; // Not eligible (T&C 2.4b)
  if (age >= 80) return null; // Not eligible (T&C 2.4e)

  const payoutRates = {
    65: 5.8, 66: 6.0, 67: 6.2, 68: 6.4, 69: 6.7,
    70: 7.0, 71: 7.3, 72: 7.6, 73: 8.0, 74: 8.4,
    75: 8.8, 76: 9.3, 77: 9.8, 78: 10.3, 79: 10.9
  };
  const rate = payoutRates[Math.min(age, 79)] || 5.8;
  return (raBalance / 1000) * rate;
}

// --- Retirement Sum Scheme estimate for 80+ ---
// Simple estimate: RA balance / expected payout years / 12
function estimateRSSPayout(raBalance, age) {
  if (raBalance <= 0) return null;
  // Rough estimate: payouts last ~10 years for someone aged 80
  const yearsRemaining = Math.max(95 - age, 5);
  return raBalance / yearsRemaining / 12;
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

// --- Update lease options on age change ---
document.getElementById("owner-1-age").addEventListener("input", updateLeaseOptions);
document.getElementById("owner-2-age").addEventListener("input", updateLeaseOptions);

function updateLeaseOptions() {
  const age1 = parseInt(document.getElementById("owner-1-age").value) || 0;
  const age2 = numOwnersSelect.value === "2"
    ? (parseInt(document.getElementById("owner-2-age").value) || 0)
    : 999;

  const youngestAge = Math.min(age1, age2);
  leaseRetainSelect.innerHTML = "";

  if (youngestAge < 65) {
    leaseRetainSelect.innerHTML = '<option value="">Enter owner age(s) first</option>';
    return;
  }

  const options = getLeaseOptions(youngestAge);
  options.forEach(years => {
    const opt = document.createElement("option");
    opt.value = years;
    opt.textContent = `${years} years`;
    leaseRetainSelect.appendChild(opt);
  });
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
  const grossProceeds = calculateGrossProceeds(marketValue, remainingLease, retainedLease);

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

  // --- Sale Proceeds ---
  document.getElementById("res-tail-years").textContent = `${tailYears} years`;
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
