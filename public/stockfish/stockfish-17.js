// Fallback Stockfish worker loader
// Loads Stockfish.js from CDN so the Worker at /stockfish/stockfish-17.js resolves
// The CDN also serves the corresponding WASM alongside the JS.
/* eslint-disable */
importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js")
