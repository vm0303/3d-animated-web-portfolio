/*
  Release-year resolver for TestMu real-device names.

  WHY THIS EXISTS
  ---------------
  The discovery matrix intentionally covers every automatable device that is
  known to be from the configured cutoff year (2020 by default) or newer.

  TestMu's catalog does not consistently expose release year, so this module
  resolves it conservatively from:
    1. explicit exact-name overrides,
    2. a year embedded in the TestMu device name,
    3. product-family generation rules that are stable enough to trust.

  IMPORTANT
  ---------
  Unknown years are returned as null. They are NOT silently treated as old and
  they are NOT silently scheduled. The coverage generator puts them in an
  UNKNOWN_YEAR_REVIEW list so we can add an explicit override when needed.
*/

const normalizeName = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const EXACT_RELEASE_YEARS = new Map(
    Object.entries({
        // Apple phones
        "iphone air": 2025,
        "iphone se 2020": 2020,
        "iphone se 2022": 2022,

        // Apple tablets commonly exposed by TestMu
        "ipad 10 2 2019": 2019,
        "ipad mini 2021": 2021,
        "ipad air 2022": 2022,
        "ipad pro 11 2022": 2022,
        "ipad pro 12 9 2022": 2022,
        "ipad pro 13 2024": 2024,
        "ipad 11 2025": 2025,
        "ipad pro 13 2025": 2025,

        // Google
        "pixel 4a": 2020,
        "pixel 4a 5g": 2020,
        "pixel fold": 2023,
        "pixel tablet": 2023,

        // Samsung / Microsoft foldables and tablets
        "galaxy z fold": 2019,
        "galaxy z flip": 2020,
        "surface duo": 2020,
        "microsoft surface duo": 2020,

        // Explicit TestMu catalog names
        "galaxy a32": 2021,
        "galaxy a32 5g": 2021,
        "galaxy tab s3": 2017,
        "galaxy tab s4": 2018,
        "iphone xr": 2018,
        "iphone xs": 2018,
        "iphone xs max": 2018,
        "realme gt2 pro": 2022,

        // Android devices observed in TestMu
        "moto g54 5g": 2023,
        "motorola moto g54 5g": 2023,
        "oneplus 11": 2023,
        "oneplus nord ce 3": 2023,
        "oppo a54": 2021,
        "oppo reno8": 2022,
        "oppo reno 8": 2022,
        "vivo t1 5g": 2022,
        "vivo v20": 2020,
        "huawei p30": 2019,
        "huawei p30 pro": 2019
    }).map(([deviceName, year]) => [
        normalizeName(deviceName),
        year,
    ])
);

const validYear = (value) => {
    const year = Number(value);
    const max = new Date().getUTCFullYear() + 1;

    return Number.isInteger(year) &&
        year >= 2000 &&
        year <= max
        ? year
        : null;
};

const fromEmbeddedYear = (deviceName) => {
    const match = String(deviceName || "")
        .match(/\b(20\d{2})\b/);

    return match
        ? validYear(match[1])
        : null;
};

const fromIPhoneGeneration = (name) => {
    const match = name.match(/^iphone\s+(\d+)/i);

    if (!match) {
        return null;
    }

    const generation = Number(match[1]);

    // iPhone 12 launched in 2020 and the numbered generation has advanced
    // by one each year since then.
    if (generation >= 12) {
        return validYear(2008 + generation);
    }

    // Earlier generations are outside the default discovery cutoff anyway.
    const older = {
        11: 2019,
        10: 2017,
        8: 2017,
        7: 2016,
        6: 2014,
        5: 2012,
    };

    return older[generation] || null;
};

const fromGalaxySGeneration = (name) => {
    const match = name.match(/^(?:samsung\s+)?galaxy\s+s(\d+)/i);

    if (!match) {
        return null;
    }

    const generation = Number(match[1]);

    if (generation >= 20 && generation <= 40) {
        return validYear(2000 + generation);
    }

    if (generation === 10) {
        return 2019;
    }

    if (generation === 9) {
        return 2018;
    }

    return null;
};

const fromGalaxyNoteGeneration = (name) => {
    const match = name.match(/^(?:samsung\s+)?galaxy\s+note\s*(\d+)/i);

    if (!match) {
        return null;
    }

    const generation = Number(match[1]);

    if (generation === 20) {
        return 2020;
    }

    if (generation === 10) {
        return 2019;
    }

    return null;
};

const fromGalaxyFoldFlipGeneration = (name) => {
    const match = name.match(/galaxy\s+z\s+(?:fold|flip)\s*(\d+)/i);

    if (!match) {
        return null;
    }

    const generation = Number(match[1]);

    // Fold2 = 2020, Fold3/Flip3 = 2021, ... Fold8/Flip8 = 2026.
    if (generation >= 2) {
        return validYear(2018 + generation);
    }

    return null;
};

const fromGalaxyTabGeneration = (name) => {
    const s = name.match(/galaxy\s+tab\s+s(\d+)/i);

    if (s) {
        const generation = Number(s[1]);
        const years = {
            7: 2020,
            8: 2022,
            9: 2023,
            10: 2024,
            11: 2025,
        };

        return years[generation] || null;
    }

    const a = name.match(/galaxy\s+tab\s+a(\d+)/i);

    if (a) {
        const generation = Number(a[1]);
        const years = {
            7: 2020,
            8: 2021,
            9: 2023,
        };

        return years[generation] || null;
    }

    return null;
};

const fromPixelGeneration = (name) => {
    const match = name.match(/^(?:google\s+)?pixel\s+(\d+)/i);

    if (!match) {
        return null;
    }

    const generation = Number(match[1]);

    // Pixel 5 = 2020, Pixel 6 = 2021, ... Pixel 11 = 2026.
    // Pixel 4a is handled explicitly because it launched in 2020 while the
    // Pixel 4 flagship generation launched in 2019.
    if (generation >= 5) {
        return validYear(2015 + generation);
    }

    if (generation === 4) {
        return 2019;
    }

    return null;
};

function resolveReleaseYear(deviceName) {
    const normalized = normalizeName(deviceName);

    if (!normalized) {
        return {
            year: null,
            source: "unknown",
            confidence: "none",
        };
    }

    const exact = EXACT_RELEASE_YEARS.get(normalized);

    if (exact) {
        return {
            year: exact,
            source: "exact-override",
            confidence: "high",
        };
    }

    const embedded = fromEmbeddedYear(deviceName);

    if (embedded) {
        return {
            year: embedded,
            source: "embedded-year",
            confidence: "high",
        };
    }

    const resolvers = [
        [fromIPhoneGeneration, "iphone-generation"],
        [fromGalaxySGeneration, "galaxy-s-generation"],
        [fromGalaxyNoteGeneration, "galaxy-note-generation"],
        [fromGalaxyFoldFlipGeneration, "galaxy-z-generation"],
        [fromGalaxyTabGeneration, "galaxy-tab-generation"],
        [fromPixelGeneration, "pixel-generation"],
    ];

    for (const [resolver, source] of resolvers) {
        const year = resolver(deviceName);

        if (year) {
            return {
                year,
                source,
                confidence: "high",
            };
        }
    }

    return {
        year: null,
        source: "unknown",
        confidence: "none",
    };
}

module.exports = {
    EXACT_RELEASE_YEARS,
    normalizeName,
    resolveReleaseYear,
};
