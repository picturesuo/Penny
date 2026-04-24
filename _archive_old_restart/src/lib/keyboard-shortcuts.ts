export const KEYBOARD_SHORTCUTS = {
  global: [
    { keys: ["cmd+shift+c"], description: "Quick capture a thought" },
    { keys: ["cmd+k"], description: "Search everything" },
    { keys: ["cmd+shift+n"], description: "Create a new map" },
    { keys: ["cmd+shift+h"], description: "Go to home dashboard" },
  ],
  mapView: [
    { keys: ["n"], description: "Add a new claim" },
    { keys: ["v"], description: "Toggle outline/graph view" },
    { keys: ["c"], description: "Start critique on selected claim" },
    { keys: ["r"], description: "Open revisit queue" },
    { keys: ["a"], description: "Generate artifact from this map" },
  ],
  editing: [
    { keys: ["cmd+enter"], description: "Save and close" },
    { keys: ["escape"], description: "Discard and close" },
  ],
} as const;
