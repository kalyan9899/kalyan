export function calcInterestAmount(amountTaken, interestRate) {
  const principal = Number(amountTaken) || 0;
  const rate = Number(interestRate) || 0;
  return (principal * rate) / 100;
}

export function calcTotalAmount(amountTaken, interestRate) {
  const principal = Number(amountTaken) || 0;
  return principal + calcInterestAmount(amountTaken, interestRate);
}
