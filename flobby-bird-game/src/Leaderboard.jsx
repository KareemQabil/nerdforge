import React, { useEffect, useState } from "react";

/**
 * Key used to persist high scores in localStorage.
 */
const STORAGE_KEY = "flobby_highscores";

/**
 * Persist a high‑score entry.
 *
 * @param {string} name  Player name.
 * @param {number} score Player score (numeric).
 */
export function saveHighScore(name, score) {
  // Defensive: ensure a valid number is stored.
  const entry = { name: String(name), score: Number(score) };
  const raw = localStorage.getItem(STORAGE_KEY);
  const stored = raw ? JSON.parse(raw) : [];
  stored.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Retrieve all persisted high‑score entries, sorted from highest to lowest.
 *
 * @returns {{name:string,score:number}[]} Sorted array of entries.
 */
export function getHighScores() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const stored = raw ? JSON.parse(raw) : [];
  // Sort descending by score.
  return stored.sort((a, b) => b.score - a.score);
}

/**
 * Simple leaderboard UI.
 *
 * The component reads the persisted scores once on mount and renders them as a
 * numbered list. It purposefully contains no styling beyond a wrapping div –
 * the surrounding game can apply CSS as needed.
 */
export function Leaderboard() {
  const [scores, setScores] = useState([]);

  useEffect(() => {
    setScores(getHighScores());
  }, []);

  return (
    <div className="leaderboard">
      <h2>Leaderboard</h2>
      <ol>
        {scores.map((entry, idx) => (
          <li key={idx}>
            {entry.name}: {entry.score}
          </li>
        ))}
      </ol>
    </div>
  );
}
