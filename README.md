# Option IQ Dashboard

> A cutting-edge, professional trading dashboard built for analyzing Indian market options and managing simulated paper trades. 

Option IQ provides a sleek, glassmorphic UI integrated with the **Black-Scholes pricing model**, **Angel One API** for real-time market data, **Firebase** for cloud authentication and portfolio tracking, and a **Premium News Aggregator** filtering top financial sources.

![Dashboard Preview](https://via.placeholder.com/1200x600?text=Option+IQ+Dashboard) *(Replace with actual screenshot)*

## 🚀 Key Features

*   **Real-time Option Chain Analysis:** Visualize Live LTP, Volume, Open Interest, and IV directly from Angel One APIs.
*   **Black-Scholes Greeks Engine:** Real-time calculation of Delta, Gamma, Theta, Vega, and Rho for any active options contract.
*   **AI-Powered Paper Trading:** Execute simulated "Go Long" and "Go Short" trades. Start with a reset ₹10,00,000 balance on every login and track your PnL dynamically.
*   **Interactive Charting:** Fully embedded TradingView widgets synced with Angel One SmartAPI candles for granular technical analysis.
*   **Premium News Aggregator:** A focused Live News ticker filtering down to only top-tier financial sources (Reuters, Bloomberg, Moneycontrol, Mint, Economic Times, etc.).
*   **Cloud Persistence:** Firebase-backed user authentication and trade history journaling.

## 🛠️ Technology Stack

*   **Framework:** Next.js 14 (App Router, Turbopack)
*   **Language:** TypeScript
*   **Styling:** TailwindCSS with dynamic, glassmorphic UI elements
*   **Backend / DB / Auth:** Google Firebase (Firestore, Auth)
*   **Market Data:** Angel One SmartAPI & Google News RSS

## ⚙️ Installation & Setup

### Prerequisites
*   Node.js v18+
*   npm or yarn
*   A Firebase Project
*   Angel One SmartAPI Developer Account

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/option-iq-dashboard.git
cd option-iq-dashboard
```

### 2. Install dependencies
```bash
npm install
# or
yarn install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory and add your credentials:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id

# Angel One SmartAPI Configuration
ANGEL_CLIENT_CODE=your_client_code
ANGEL_PASSWORD=your_password
ANGEL_TOTP_SECRET=your_totp_secret
ANGEL_API_KEY=your_api_key
```
*(Note: Your actual Firebase Config is hardcoded in `lib/firebase.ts` for consistent runtime connectivity, but environment variables can be used if deployed to Vercel).*

### 4. Run the Development Server
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the dashboard.

## 📈 Paper Trading Workflow
1.  **Sign Up / Login:** Authenticate using Firebase Email/Password. Your account balance will automatically initialize (or reset) to ₹10,00,000.
2.  **Select Symbol:** Use the top search bar to find indices (e.g., NIFTY) or equities.
3.  **Analyze:** Use the Market Chart and Option Chain views to identify trading opportunities. The AI Recommendation Engine will process the Greeks to suggest actions.
4.  **Execute:** Use the Simulation Panel to set quantities and execute a paper trade. Track the transaction in the Trade History Journal.

## 📄 License
This project is open-sourced under the [MIT license](LICENSE).

---
*Disclaimer: This dashboard is for educational and simulation purposes only. Simulated results do not represent actual trading and may not account for real-world slippage or liquidity constraints.*
