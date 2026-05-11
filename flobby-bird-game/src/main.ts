/**
 * Entry point for the Flobby Bird Game.
 * This module initializes the core game logic and starts the render loop.
 */

import { GameCore } from "./GameCore";

// Initialise the game core.
const game = new GameCore();

/**
 * Main animation loop. Delegates the tick to the GameCore instance.
 * @param timestamp - The current time supplied by requestAnimationFrame.
 */
function gameLoop(timestamp: number): void {
  game.update(timestamp);
  requestAnimationFrame(gameLoop);
}

// Start the loop.
requestAnimationFrame(gameLoop);
