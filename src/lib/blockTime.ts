/**
 * Computes block time (minutes) from scheduled departure/arrival times
 * expressed in minutes-since-midnight UTC, accounting for the arrival day
 * offset (0 = same UTC day as departure, 1 = next UTC day, etc.).
 *
 * blockTimeMin = staUTCMin + arrivalDayOffset * 1440 - stdUTCMin
 *
 * Throws for a data error: a non-positive result means STA is not after STD
 * once the day offset is applied, which cannot represent a real flight.
 */
export function computeBlockTimeMin(
  stdUTCMin: number,
  staUTCMin: number,
  arrivalDayOffset: number
): number {
  if (
    !Number.isFinite(stdUTCMin) ||
    !Number.isFinite(staUTCMin) ||
    !Number.isFinite(arrivalDayOffset)
  ) {
    throw new Error(
      `computeBlockTimeMin: all inputs must be finite numbers (got stdUTCMin=${stdUTCMin}, staUTCMin=${staUTCMin}, arrivalDayOffset=${arrivalDayOffset})`
    );
  }

  const blockTimeMin = staUTCMin + arrivalDayOffset * 1440 - stdUTCMin;

  if (blockTimeMin <= 0) {
    throw new Error(
      `computeBlockTimeMin: computed non-positive block time (${blockTimeMin} min) for stdUTCMin=${stdUTCMin}, staUTCMin=${staUTCMin}, arrivalDayOffset=${arrivalDayOffset}. This indicates a data error (STA must be after STD once arrivalDayOffset is applied).`
    );
  }

  return blockTimeMin;
}
