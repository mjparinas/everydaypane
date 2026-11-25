// Airthings indoor air (Melvin, 2026-11-21: "do all 6", Airthings among them). Shared by the server's feed, the
// household panel and tests. The display gets each reading's level from the server and never imports this file.

export const AIRTHINGS_KINDS = ["radon", "co2", "voc", "pm25", "pm1", "humidity", "temp"] as const;
export type AirthingsKind = (typeof AIRTHINGS_KINDS)[number];

export const AIRTHINGS_LABELS: Record<AirthingsKind, string> = {
  radon: "Radon",
  co2: "CO₂",
  voc: "VOC",
  pm25: "PM2.5",
  pm1: "PM1",
  humidity: "Humidity",
  temp: "Temperature",
};

/** What a new widget shows: everything but PM1, which most homes read the same as PM2.5. */
export const AIRTHINGS_DEFAULT_KINDS: AirthingsKind[] = ["radon", "co2", "voc", "pm25", "humidity", "temp"];

export type AirLevel = "good" | "fair" | "poor";

/** One Bq/m³ is 1/37 pCi/L. */
export const BQ_PER_PCI = 37;

/**
 * Airthings' own colour bands, in metric (radon Bq/m³, CO₂ ppm, VOC ppb, PM µg/m³, humidity %, temperature °C), so the
 * wall matches the Airthings app. Health Canada's radon guideline is 200 Bq/m³; Airthings turns red sooner, at 150.
 */
export function airLevel(kind: AirthingsKind, metric: number): AirLevel {
  switch (kind) {
    case "radon":
      return metric >= 150 ? "poor" : metric >= 100 ? "fair" : "good";
    case "co2":
      return metric >= 1000 ? "poor" : metric >= 800 ? "fair" : "good";
    case "voc":
      return metric >= 2000 ? "poor" : metric >= 250 ? "fair" : "good";
    case "pm25":
    case "pm1":
      return metric >= 25 ? "poor" : metric >= 10 ? "fair" : "good";
    case "humidity":
      return metric < 25 || metric >= 70 ? "poor" : metric < 30 || metric >= 60 ? "fair" : "good";
    case "temp":
      return metric < 18 || metric > 25 ? "fair" : "good";
  }
}

/** The API's sensor names (consumer API `sensorType`) for the readings we show. */
export const AIRTHINGS_SENSOR_TYPES: Record<string, AirthingsKind> = {
  radonShortTermAvg: "radon",
  co2: "co2",
  voc: "voc",
  pm25: "pm25",
  pm1: "pm1",
  humidity: "humidity",
  temp: "temp",
};

/** Radon at or above this is "poor" and can go on the alert strip (Bq/m³). */
export const RADON_ALERT_BQ = 150;
