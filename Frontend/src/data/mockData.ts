import { Droplets, Thermometer, Wind } from 'lucide-react';

// ─── Shared data ──────────────────────────────────────────────────────────────
export const PRICE_DATA = [
  { date: "Jun 17", price: 2420 }, { date: "Jun 18", price: 2435 },
  { date: "Jun 19", price: 2450 }, { date: "Jun 20", price: 2468 },
  { date: "Jun 21", price: 2490 }, { date: "Jun 22", price: 2510 },
  { date: "Jun 23", price: 2450 },
  { date: "Jun 24", price: 2520 }, { date: "Jun 25", price: 2565 },
  { date: "Jun 26", price: 2598 }, { date: "Jun 27", price: 2635 },
  { date: "Jun 28", price: 2668 }, { date: "Jun 29", price: 2690 },
  { date: "Jun 30", price: 2707 },
];

export const MARKETS = [
  { name: "Agra Mandi (APMC)", price: 2450, distance: "3 km", change: "+0.8%", vol: "1,240 MT" },
  { name: "Mathura Mandi", price: 2470, distance: "58 km", change: "+1.6%", vol: "820 MT" },
  { name: "Firozabad Mandi", price: 2445, distance: "42 km", change: "+0.6%", vol: "540 MT" },
  { name: "Aligarh Mandi", price: 2460, distance: "95 km", change: "+1.2%", vol: "310 MT" },
];

export const WEATHER = [
  { date: "Mon, Jun 23", high: "32°C", low: "22°C", rain: 20, humidity: "68%", condition: "Partly Cloudy" },
  { date: "Tue, Jun 24", high: "33°C", low: "23°C", rain: 15, humidity: "65%", condition: "Sunny" },
  { date: "Wed, Jun 25", high: "30°C", low: "21°C", rain: 45, humidity: "78%", condition: "Overcast" },
  { date: "Thu, Jun 26", high: "28°C", low: "20°C", rain: 70, humidity: "85%", condition: "Heavy Rain" },
  { date: "Fri, Jun 27", high: "27°C", low: "19°C", rain: 65, humidity: "82%", condition: "Rain" },
  { date: "Sat, Jun 28", high: "29°C", low: "20°C", rain: 30, humidity: "72%", condition: "Partly Cloudy" },
  { date: "Sun, Jun 29", high: "31°C", low: "22°C", rain: 10, humidity: "60%", condition: "Sunny" },
];

export const SCHEMES = [
  {
    name: "PM-KISAN", ministry: "Ministry of Agriculture", category: "Income Support",
    description: "Direct income support of ₹6,000 per year to landholding farmer families across India in three equal instalments.",
    benefit: "₹6,000 / year", deadline: "Rolling", status: "Eligible", applied: false,
  },
  {
    name: "PM Fasal Bima Yojana", ministry: "Ministry of Agriculture", category: "Insurance",
    description: "Comprehensive crop insurance covering losses from natural calamities, pests, and diseases with low premium rates.",
    benefit: "Up to ₹2,00,000", deadline: "Jul 31, 2026", status: "Eligible", applied: false,
  },
  {
    name: "UP Wheat MSP Bonus", ministry: "UP State Agriculture Dept.", category: "Procurement",
    description: "Uttar Pradesh state procurement at MSP with ₹500/quintal bonus for registered farmers.",
    benefit: "₹500 / quintal", deadline: "Aug 15, 2026", status: "Eligible", applied: false,
  },
  {
    name: "Kisan Credit Card", ministry: "NABARD / RBI", category: "Credit",
    description: "Short-term credit for agricultural operations including crop production, post-harvest expenses, and allied activities.",
    benefit: "Up to ₹3,00,000", deadline: "Rolling", status: "Eligible", applied: true,
  },
  {
    name: "Soil Health Card Scheme", ministry: "Ministry of Agriculture", category: "Advisory",
    description: "Provides soil health cards to farmers with crop-wise recommendations for nutrients and fertilisers.",
    benefit: "Free", deadline: "Rolling", status: "Registered", applied: true,
  },
  {
    name: "PM Krishi Sinchai Yojana", ministry: "Ministry of Jal Shakti", category: "Irrigation",
    description: "Achieve convergence of investments in irrigation, extend coverage and improve on-farm water use efficiency.",
    benefit: "50–90% subsidy", deadline: "Sep 30, 2026", status: "Not Assessed", applied: false,
  },
];

export const TREATMENT_STEPS = [
  "Apply Propiconazole 25% EC at 0.1% concentration (1 ml/litre water) as foliar spray immediately.",
  "Repeat application after 14 days if lesion spread exceeds 30% of leaf area.",
  "Destroy severely infected crop residue; do not compost infected material.",
  "Maintain 72-hour interval from rainfall before spraying; avoid Jun 25–27 window.",
];

export const ACTIONS = [
  { priority: "Urgent", color: "text-red-600 bg-red-50", border: "border-red-200", action: "Apply Propiconazole 25% EC fungicide before Jun 25 rainfall window." },
  { priority: "High", color: "text-amber-700 bg-amber-50", border: "border-amber-200", action: "Delay wheat sale by 7 days to capture projected price of ₹2,707/quintal." },
  { priority: "High", color: "text-amber-700 bg-amber-50", border: "border-amber-200", action: "Submit PMFBY crop insurance application before Jul 31, 2026 deadline." },
  { priority: "Medium", color: "text-blue-700 bg-blue-50", border: "border-blue-200", action: "Avoid field operations and spraying on Jun 25–27 due to heavy rain forecast." },
];

