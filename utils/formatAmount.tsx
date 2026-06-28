// Adds comma thousands separators to the integer part of a numeric string
// while preserving its original decimal places. Operates on the string (not a
// parsed Number) so ledger's display precision — including trailing zeros — is
// kept intact.
const groupThousands = (absNumStr: string): string => {
  const [intPart, decPart] = absNumStr.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped;
};

const formatAmountWithoutUnit = (str: string, unit?: string) => {
  const fixedStr = str.replaceAll(',', '');
  const grouped = groupThousands(fixedStr.replace(/^-/, ''));
  if (Number(fixedStr) < 0) {
    return (
      <span className="font-medium text-negative tabular-nums">
        {unit}&nbsp;({grouped})
      </span>
    );
  } else {
    return (
      <span className="font-medium text-positive tabular-nums">
        {unit}&nbsp;{grouped}
      </span>
    );
  }
};

const formatAmount = (str: string | undefined | null, withUnit: boolean) => {
  if (!str || !str.trim()) {
    return <span className="text-muted-foreground">—</span>;
  }
  const splitted = str.split(' ');
  if (splitted.length < 2) {
    return formatAmountWithoutUnit(str);
  } else if (withUnit) {
    return formatAmountWithoutUnit(splitted[1], splitted[0]);
  } else {
    return formatAmountWithoutUnit(splitted[1]);
  }
};

export default formatAmount;
