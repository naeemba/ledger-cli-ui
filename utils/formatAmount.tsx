const formatAmountWithoutUnit = (str: string, unit?: string) => {
  const fixedStr = str.replaceAll(',', '');
  if (Number(fixedStr) < 0) {
    return (
      <span className="text-red-900">
        {unit}&nbsp;(
        {Math.abs(Number(fixedStr))
          .toFixed(3)
          .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        )
      </span>
    );
  } else {
    return (
      <span className="text-green-900">
        {unit}&nbsp;{str}
      </span>
    );
  }
};

const formatAmount = (str: string, withUnit: boolean) => {
  const splitted = str.split(' ');
  // there is unit within amount
  if (splitted.length < 2) {
    return formatAmountWithoutUnit(str);
  } else if (withUnit) {
    return formatAmountWithoutUnit(splitted[1], splitted[0]);
  } else {
    return formatAmountWithoutUnit(splitted[1]);
  }
};

export default formatAmount;
