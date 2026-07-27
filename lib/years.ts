export function parseYearInput(input: string) {
  const years = new Set<number>();
  const tokens = input
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);

    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);

      if (isValidYear(start) && isValidYear(end)) {
        const rangeStart = Math.min(start, end);
        const rangeEnd = Math.max(start, end);

        for (let year = rangeStart; year <= rangeEnd; year += 1) {
          years.add(year);
        }
      }

      continue;
    }

    const year = Number.parseInt(token, 10);

    if (isValidYear(year) && String(year) === token) {
      years.add(year);
    }
  }

  return Array.from(years).sort((a, b) => a - b);
}

export function formatYears(years: number[] | undefined) {
  if (!years?.length) {
    return "";
  }

  const sortedYears = Array.from(new Set(years)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let rangeStart = sortedYears[0];
  let previousYear = sortedYears[0];

  for (let index = 1; index < sortedYears.length; index += 1) {
    const year = sortedYears[index];

    if (year === previousYear + 1) {
      previousYear = year;
      continue;
    }

    ranges.push(formatYearRange(rangeStart, previousYear));
    rangeStart = year;
    previousYear = year;
  }

  ranges.push(formatYearRange(rangeStart, previousYear));

  return ranges.join(", ");
}

function formatYearRange(start: number, end: number) {
  return start === end ? String(start) : `${start}-${end}`;
}

function isValidYear(year: number) {
  return Number.isInteger(year) && year >= 0 && year <= 3000;
}
