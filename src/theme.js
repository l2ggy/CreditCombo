function getSystemTheme() {
  if (!window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_STORAGE_KEY = "creditcombo-theme";
const THEME_SYSTEM_STORAGE_KEY = "creditcombo-theme-system";

function readStoredThemePreference() {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const storedSystemTheme = window.localStorage.getItem(THEME_SYSTEM_STORAGE_KEY);

    if ((storedTheme !== "light" && storedTheme !== "dark") ||
      (storedSystemTheme !== "light" && storedSystemTheme !== "dark")) {
      return null;
    }

    return { theme: storedTheme, systemTheme: storedSystemTheme };
  } catch {
    return null;
  }
}

function persistThemePreference(theme, systemTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(THEME_SYSTEM_STORAGE_KEY, systemTheme);
  } catch {
    // Ignore localStorage failures (privacy mode, disabled storage, etc.)
  }
}

function resolveInitialTheme() {
  const systemTheme = getSystemTheme();
  const storedPreference = readStoredThemePreference();

  if (!storedPreference) {
    persistThemePreference(systemTheme, systemTheme);
    return systemTheme;
  }

  if (storedPreference.systemTheme !== systemTheme) {
    persistThemePreference(systemTheme, systemTheme);
    return systemTheme;
  }

  return storedPreference.theme;
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (!themeToggle) return;

  const nextTheme = theme === "dark" ? "light" : "dark";
  themeToggle.textContent = nextTheme === "light" ? "☀︎" : "☾";
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  themeToggle.title = `Switch to ${nextTheme} mode`;
}

const systemThemeQuery = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;


function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

function applyBackgroundMotionSeed() {
  const root = document.documentElement;

  root.style.setProperty("--bg-float-a-duration", `${randomBetween(29, 38).toFixed(2)}s`);
  root.style.setProperty("--bg-float-b-duration", `${randomBetween(34, 46).toFixed(2)}s`);
  root.style.setProperty("--bg-float-a-delay", `${(-1 * randomBetween(0, 34)).toFixed(2)}s`);
  root.style.setProperty("--bg-float-b-delay", `${(-1 * randomBetween(0, 40)).toFixed(2)}s`);
  root.style.setProperty("--bg-float-a-direction", Math.random() < 0.5 ? "alternate" : "alternate-reverse");
  root.style.setProperty("--bg-float-b-direction", Math.random() < 0.5 ? "alternate" : "alternate-reverse");

  root.style.setProperty("--bg-float-a-origin-x", `${randomBetween(-2.2, 2.2).toFixed(2)}vw`);
  root.style.setProperty("--bg-float-a-origin-y", `${randomBetween(-1.8, 1.8).toFixed(2)}vh`);
  root.style.setProperty("--bg-float-b-origin-x", `${randomBetween(-2.8, 2.8).toFixed(2)}vw`);
  root.style.setProperty("--bg-float-b-origin-y", `${randomBetween(-2.2, 2.2).toFixed(2)}vh`);

  root.style.setProperty("--bg-float-a-dir-x", `${randomSign()}`);
  root.style.setProperty("--bg-float-a-dir-y", `${randomSign()}`);
  root.style.setProperty("--bg-float-b-dir-x", `${randomSign()}`);
  root.style.setProperty("--bg-float-b-dir-y", `${randomSign()}`);

  root.style.setProperty("--bg-float-a-scale", `${randomBetween(0.994, 1.012).toFixed(4)}`);
  root.style.setProperty("--bg-float-b-scale", `${randomBetween(0.992, 1.014).toFixed(4)}`);
}

applyBackgroundMotionSeed();
applyTheme(resolveInitialTheme());

document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (!themeToggle) return;

  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    persistThemePreference(nextTheme, getSystemTheme());
  });

  const syncToSystemTheme = () => {
    const systemTheme = getSystemTheme();
    applyTheme(systemTheme);
    persistThemePreference(systemTheme, systemTheme);
  };

  if (systemThemeQuery) {
    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", syncToSystemTheme);
    } else if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(syncToSystemTheme);
    }
  }
});
