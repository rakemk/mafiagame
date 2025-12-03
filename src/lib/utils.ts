import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRoleDistribution(maxPlayers: number) {
  // Clamp to expected bounds and ensure integer
  const players = Math.max(10, Math.min(20, Math.floor(Number(maxPlayers) || 10)));

  // Desired fractions
  const roleFraction = 0.2; // mafia, doctor, police each

  // Start with floored allocations and a minimum of 2 for each role
  let mafia = Math.max(2, Math.floor(players * roleFraction));
  let doctor = Math.max(2, Math.floor(players * roleFraction));
  let police = Math.max(2, Math.floor(players * roleFraction));

  // Remaining players become citizens
  let citizens = players - (mafia + doctor + police);

  // If citizens became negative (shouldn't normally happen), reduce roles back toward 2
  if (citizens < 0) {
    let excess = -citizens;
    const reduceOrder: Array<"police" | "doctor" | "mafia"> = ["police", "doctor", "mafia"];
    let idx = 0;
    while (excess > 0) {
      const role = reduceOrder[idx % reduceOrder.length];
      if (role === "police" && police > 2) {
        police -= 1;
        excess -= 1;
      } else if (role === "doctor" && doctor > 2) {
        doctor -= 1;
        excess -= 1;
      } else if (role === "mafia" && mafia > 2) {
        mafia -= 1;
        excess -= 1;
      }
      idx += 1;
      // safety break
      if (idx > 10) break;
    }
    citizens = players - (mafia + doctor + police);
  }

  return { mafia, doctor, police, citizens };
}

export function isValidPlayerName(name: string) {
  if (!name) return false;
  const trimmed = name.trim();
  // Allow only ASCII letters and spaces, minimum 2 characters after trim
  const re = /^[A-Za-z\s]{2,}$/;
  return re.test(trimmed);
}

export async function copyToClipboard(text: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers: use a hidden textarea
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.width = "1px";
      textarea.style.height = "1px";
      textarea.style.padding = "0";
      textarea.style.border = "none";
      textarea.style.outline = "none";
      textarea.style.boxShadow = "none";
      textarea.style.background = "transparent";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    }

    return false;
  } catch (e) {
    return false;
  }
}
