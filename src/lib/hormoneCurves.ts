// Shared hormone curve model — mirrors HormoneChart values.
export function getHormoneValue(
  hormone: string,
  dayAt: number,
  cycleLengthDays: number,
  menEnd: number,
  ovDay: number,
  ovStart: number,
  ovEnd: number
): number {
  switch (hormone) {
    case "estrogen": {
      if (dayAt <= menEnd) return 0.12 + (dayAt / menEnd) * 0.08;
      if (dayAt <= ovStart) return 0.20 + ((dayAt - menEnd) / (ovStart - menEnd)) * 0.72;
      if (dayAt <= ovEnd) return 0.92 - ((dayAt - ovStart) / (ovEnd - ovStart)) * 0.30;
      const lp = (dayAt - ovEnd) / (cycleLengthDays - ovEnd);
      return 0.62 - lp * 0.48;
    }
    case "progesterone": {
      if (dayAt <= ovEnd) return 0.06;
      const lp = (dayAt - ovEnd) / (cycleLengthDays - ovEnd);
      return 0.06 + 0.72 * Math.sin(lp * Math.PI);
    }
    case "fsh": {
      if (dayAt <= menEnd) {
        const p = dayAt / menEnd;
        return 0.25 + p * 0.30;
      }
      if (dayAt <= ovStart) {
        const p = (dayAt - menEnd) / (ovStart - menEnd);
        return 0.55 - p * 0.25;
      }
      if (dayAt <= ovEnd) {
        const p = (dayAt - ovStart) / (ovEnd - ovStart);
        return 0.30 + p * 0.35 * Math.sin(p * Math.PI);
      }
      return 0.10 + 0.05 * Math.sin(((dayAt - ovEnd) / (cycleLengthDays - ovEnd)) * Math.PI * 0.5);
    }
    case "lh": {
      if (dayAt < ovStart - 1) return 0.08;
      if (dayAt <= ovDay) {
        const p = (dayAt - (ovStart - 1)) / (ovDay - (ovStart - 1));
        return 0.08 + 0.87 * Math.pow(p, 1.5);
      }
      if (dayAt <= ovEnd + 1) {
        const p = (dayAt - ovDay) / (ovEnd + 1 - ovDay);
        return 0.95 - p * 0.82;
      }
      return 0.08 + 0.05 * Math.sin(((dayAt - ovEnd) / (cycleLengthDays - ovEnd)) * Math.PI * 0.3);
    }
    default:
      return 0;
  }
}

export function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
