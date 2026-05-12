const formatAmountWithoutUnit = (str: string, unit?: string) => {
  const fixedStr = str.replaceAll(',', '');
  if (Number(fixedStr) < 0) {
    return (
      <span className="font-medium text-negative tabular-nums">
        {unit}&nbsp;(
        {Math.abs(Number(fixedStr))
          .toFixed(3)
          .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        )
      </span>
    );
  } else {
    return (
      <span className="font-medium text-positive tabular-nums">
        {unit}&nbsp;{str}
      </span>
    );
  }
};

const formatAmount = (str: string | undefined | null, withUnit: boolean) => {
  if (!str || !str.trim()) {
    return <span className="text-muted">—</span>;
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
