// ============================================================
// HDB Lease Buyback Scheme (LBS) Calculator
// Based on rules effective from 1 Jan 2026
// ============================================================

// --- Bala's Table (Lease Depreciation Curve) ---
// Maps remaining lease years to percentage of freehold value.
// Used to calculate the value of the tail-end lease sold to HDB.
// Values are approximate and interpolated from commonly referenced data.
const BALAS_TABLE = {
  0: 0, 5: 7, 10: 15, 15: 24, 20: 33, 25: 41,
  30: 49, 35: 56, 40: 63, 45: 69, 50: 74,
  55: 78, 60: 82, 65: 85, 70: 88, 75: 90,
  80: 91, 85: 93, 90: 95, 95: 97, 99: 99
};

function getLeaseValue(years) {
  // Clamp
  if (years <= 0) return 0;
  if (years >= 99) return 99;

  // Find surrounding data points and interpolate
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

function calculateProceeds(marketValue, remainingLease, retainedLease) {
  // Value of retained lease relative to current value
  const currentFactor = getLeaseValue(remainingLease);
  const retainedFactor = getLeaseValue(retainedLease);

  if (currentFactor === 0) return 0;

  // Proceeds = market value × (current - retained) / current
  return marketValue * (currentFactor - retainedFactor) / currentFactor;
}

// --- Top-up Requirements (from 1 Jan 2026) ---
function getTopUpRequirement(age, numOwners) {
  // Returns the required RA top-up amount per owner
  let requirement;
  if (numOwners === 1) {
    // Full Retirement Sum (age-adjusted)
    if (age >= 80) requirement = 200400;
    else if (age >= 70) requirement = 210400;
    else requirement = 220400; // 65-69
  } else {
    // Basic Retirement Sum (age-adjusted)
    if (age >= 80) requirement = 100200;
    else if (age >= 70) requirement = 105200;
    else requirement = 110200; // 65-69
  }
  return requirement;
}

// --- LBS Bonus ---
function calculateBonus(flatType, totalTopUp) {
  const maxBonus = {
    "3room": 30000,
    "4room": 15000,
    "5room": 7500
  };
  const topUpRatio = {
    "3room": 2,  // $1 per $2 top-up
    "4room": 4,  // $1 per $4 top-up
    "5room": 8   // $1 per $8 top-up
  };

  const max = maxBonus[flatType];
  const ratio = topUpRatio[flatType];

  if (totalTopUp <= 0) return 0;
  if (totalTopUp >= 60000) return max;

  // Pro-rated: $1 for every $ratio of CPF top-up
  const prorated = totalTopUp / ratio;
  return Math.min(prorated, max);
}

// --- Lease Retention Options ---
function getLeaseOptions(youngestAge) {
  if (youngestAge >= 80) return [15, 20, 25, 30, 35];
  if (youngestAge >= 75) return [20, 25, 30, 35];
  if (youngestAge >= 70) return [25, 30, 35];
  return [30, 35]; // 65-69
}

// --- CPF LIFE Monthly Payout Estimate ---
// Very rough estimate based on CPF LIFE Standard Plan payout rates.
// Actual payouts depend on many factors. This is a simplified approximation.
function estimateMonthlyPayout(raBalance, age) {
  if (raBalance < 60000) return null; // Not eligible for CPF LIFE
  if (age >= 80) return null; // Not eligible if 80+

  // Approximate monthly payout per $1000 in RA at different ages
  // These are rough estimates based on CPF LIFE Standard Plan
  const payoutRates = {
    65: 5.8,  // ~$5.80 per $1000 RA balance per month
    66: 6.0,
    67: 6.2,
    68: 6.4,
    69: 6.7,
    70: 7.0,
    71: 7.3,
    72: 7.6,
    73: 8.0,
    74: 8.4,
    75: 8.8,
    76: 9.3,
    77: 9.8,
    78: 10.3,
    79: 10.9
  };

  const rate = payoutRates[Math.min(age, 79)] || 5.8;
  return (raBalance / 1000) * rate;
}

// --- Format currency ---
function fmt(amount) {
  if (amount === null || amount === undefined) return "N/A";
  return "$" + Math.round(amount).toLocaleString("en-SG");
}

// --- DOM Elements ---
const form = document.getElementById("lbs-form");
const numOwnersSelect = document.getElementById("num-owners");
const owner2Section = document.getElementById("owner-2-section");
const leaseRetainSelect = document.getElementById("lease-retain");
const resultsSection = document.getElementById("results");

// --- Toggle Owner 2 ---
numOwnersSelect.addEventListener("change", () => {
  const show = numOwnersSelect.value === "2";
  owner2Section.classList.toggle("hidden", !show);
  const owner2Inputs = owner2Section.querySelectorAll("input");
  owner2Inputs.forEach(input => {
    input.required = show;
    if (!show) input.value = "";
  });
  updateLeaseOptions();
});

// --- Update lease retention options when ages change ---
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

// --- Form Submission ---
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const flatType = document.getElementById("flat-type").value;
  const marketValue = parseFloat(document.getElementById("market-value").value);
  const remainingLease = parseFloat(document.getElementById("remaining-lease").value);
  const outstandingLoan = parseFloat(document.getElementById("outstanding-loan").value) || 0;
  const numOwners = parseInt(numOwnersSelect.value);
  const retainedLease = parseInt(leaseRetainSelect.value);

  const owner1Age = parseInt(document.getElementById("owner-1-age").value);
  const owner1RA = parseFloat(document.getElementById("owner-1-ra").value);

  let owner2Age = null, owner2RA = null;
  if (numOwners === 2) {
    owner2Age = parseInt(document.getElementById("owner-2-age").value);
    owner2RA = parseFloat(document.getElementById("owner-2-ra").value);
  }

  // Validate retained lease is less than remaining lease
  if (retainedLease >= remainingLease) {
    alert("Retained lease must be shorter than the remaining lease on the flat.");
    return;
  }

  // --- Calculate ---
  const tailYears = remainingLease - retainedLease;
  const grossProceeds = calculateProceeds(marketValue, remainingLease, retainedLease);
  const netProceeds = Math.max(grossProceeds - outstandingLoan, 0);

  // Top-up requirements
  const owner1Requirement = getTopUpRequirement(owner1Age, numOwners);
  const owner1Shortfall = Math.max(owner1Requirement - owner1RA, 0);

  let owner2Shortfall = 0;
  let owner2Requirement = 0;
  if (numOwners === 2) {
    owner2Requirement = getTopUpRequirement(owner2Age, numOwners);
    owner2Shortfall = Math.max(owner2Requirement - owner2RA, 0);
  }

  const totalShortfall = owner1Shortfall + owner2Shortfall;

  // The total top-up is the minimum of the net proceeds and total shortfall
  // (you can't top up more than the shortfall initially)
  const initialTopUp = Math.min(netProceeds, totalShortfall);

  // LBS Bonus (based on total top-up to RA)
  const bonus = calculateBonus(flatType, initialTopUp);

  // Total available after initial top-up
  const afterTopUp = netProceeds - initialTopUp + bonus;

  // Cash retained (up to $100,000 per household)
  const cashRetained = Math.min(afterTopUp, 100000);
  const remainingAfterCash = afterTopUp - cashRetained;

  // Any remaining must go to further RA top-up (to FRS)
  // For simplicity, we add this to the total RA top-up
  const furtherTopUp = remainingAfterCash;
  const totalTopUp = initialTopUp + furtherTopUp;

  // CPF LIFE estimate
  const owner1FinalRA = owner1RA + (numOwners === 1 ? totalTopUp : totalTopUp / 2);
  let owner2FinalRA = 0;
  if (numOwners === 2) {
    owner2FinalRA = owner2RA + totalTopUp / 2;
  }

  const owner1Monthly = estimateMonthlyPayout(owner1FinalRA, owner1Age);
  let owner2Monthly = null;
  if (numOwners === 2) {
    owner2Monthly = estimateMonthlyPayout(owner2FinalRA, owner2Age);
  }

  const totalMonthly = (owner1Monthly || 0) + (owner2Monthly || 0);

  // --- Display Results ---
  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth" });

  document.getElementById("res-tail-years").textContent = `${tailYears} years`;
  document.getElementById("res-proceeds").textContent = fmt(grossProceeds);

  const loanRow = document.getElementById("res-loan-row");
  if (outstandingLoan > 0) {
    loanRow.classList.remove("hidden");
    document.getElementById("res-loan").textContent = `-${fmt(outstandingLoan)}`;
  } else {
    loanRow.classList.add("hidden");
  }

  document.getElementById("res-net-proceeds").textContent = fmt(netProceeds);
  document.getElementById("res-bonus").textContent = fmt(bonus);

  const bonusNote = initialTopUp >= 60000
    ? "Full bonus (total RA top-up >= $60,000)"
    : initialTopUp > 0
      ? "Pro-rated bonus (total RA top-up < $60,000)"
      : "No bonus (no RA top-up required)";
  document.getElementById("res-bonus-note").textContent = bonusNote;

  // Top-up details
  const topupDetails = document.getElementById("res-topup-details");
  topupDetails.innerHTML = "";

  function addTopupRow(label, value) {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `<span>${label}</span><span class="result-value">${fmt(value)}</span>`;
    topupDetails.appendChild(row);
  }

  if (numOwners === 1) {
    addTopupRow("Owner RA shortfall", owner1Shortfall);
    addTopupRow("RA top-up (to requirement)", Math.min(initialTopUp, owner1Shortfall));
    if (furtherTopUp > 0) addTopupRow("Further RA top-up", furtherTopUp);
  } else {
    addTopupRow("Owner 1 RA shortfall", owner1Shortfall);
    addTopupRow("Owner 2 RA shortfall", owner2Shortfall);
    if (furtherTopUp > 0) addTopupRow("Further RA top-up", furtherTopUp);
  }

  document.getElementById("res-total-topup").textContent = fmt(totalTopUp);
  document.getElementById("res-cash").textContent = fmt(cashRetained);

  // Monthly payout
  const monthlyRow = document.getElementById("res-monthly-row");
  if (totalMonthly > 0) {
    monthlyRow.classList.remove("hidden");
    document.getElementById("res-monthly").textContent = `~${fmt(totalMonthly)}/mo`;

    let cpfNote = "";
    if (numOwners === 1) {
      cpfNote = owner1Monthly
        ? `Owner: ~${fmt(owner1Monthly)}/mo (est. with RA of ${fmt(owner1FinalRA)})`
        : "Owner not eligible for CPF LIFE";
    } else {
      const o1 = owner1Monthly ? `Owner 1: ~${fmt(owner1Monthly)}/mo` : "Owner 1: not eligible";
      const o2 = owner2Monthly ? `Owner 2: ~${fmt(owner2Monthly)}/mo` : "Owner 2: not eligible";
      cpfNote = `${o1} | ${o2}`;
    }
    document.getElementById("res-cpf-life-note").textContent = cpfNote;
  } else {
    monthlyRow.classList.add("hidden");
    document.getElementById("res-cpf-life-note").textContent =
      "Not eligible for CPF LIFE (RA below $60,000 or aged 80+)";
  }

  // Summary
  document.getElementById("res-summary-cash").textContent = fmt(cashRetained);
  document.getElementById("res-summary-cpf").textContent = fmt(totalTopUp);

  const summaryMonthlyRow = document.getElementById("res-summary-monthly-row");
  if (totalMonthly > 0) {
    summaryMonthlyRow.classList.remove("hidden");
    document.getElementById("res-summary-monthly").textContent = `~${fmt(totalMonthly)}/mo`;
  } else {
    summaryMonthlyRow.classList.add("hidden");
  }
});
