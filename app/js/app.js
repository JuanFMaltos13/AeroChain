import {
    Connection,
    clusterApiUrl,
    LAMPORTS_PER_SOL
} from "https://esm.sh/@solana/web3.js@1.98.4";

const connection = new Connection(
    clusterApiUrl("devnet"),
    "confirmed"
);

const connectButton = document.getElementById("connectWallet");
const balanceElement = document.getElementById("walletBalance");
const statusElement = document.getElementById("walletStatus");

let walletPublicKey = null;

async function connectWallet() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            alert("Please install Phantom Wallet first.");
            window.open("https://phantom.com/", "_blank");
            return;
        }

        const response = await window.solana.connect();

        walletPublicKey = response.publicKey;

        const balance = await connection.getBalance(walletPublicKey);

        balanceElement.textContent =
            (balance / LAMPORTS_PER_SOL).toFixed(4) + " SOL";

        statusElement.textContent =
            walletPublicKey.toBase58().slice(0, 8) + "...";

        connectButton.textContent =
            walletPublicKey.toBase58().slice(0, 4) + "..." +
            walletPublicKey.toBase58().slice(-4);

        console.log("Wallet connected:", walletPublicKey.toBase58());
        console.log("Network: Solana Devnet");

    } catch (error) {
        console.error("Wallet connection error:", error);
        alert("Unable to connect wallet: " + error.message);
    }
}

connectButton.addEventListener("click", connectWallet);

window.solana?.on("disconnect", () => {
    walletPublicKey = null;
    balanceElement.textContent = "-- SOL";
    statusElement.textContent = "Wallet disconnected";
    connectButton.textContent = "Connect Wallet";
});

console.log("AeroChain frontend initialized.");
console.log("Solana network: Devnet");
