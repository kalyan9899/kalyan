function calcInterestAmount(amountTaken, interestRate) {
  const principal = Number(amountTaken) || 0;
  const rate = Number(interestRate) || 0;
  return (principal * rate) / 100;
}

function calcTotalAmount(amountTaken, interestRate) {
  const principal = Number(amountTaken) || 0;
  return principal + calcInterestAmount(amountTaken, interestRate);
}

function getClientInterestAmount(client) {
  if (client?.planInterestAmount !== undefined && client?.planInterestAmount !== null) {
    return Number(client.planInterestAmount) || 0;
  }
  return calcInterestAmount(client?.amountTaken, client?.interestRate);
}

function getClientTotalPayable(client) {
  if (client?.totalPayable !== undefined && client?.totalPayable !== null) {
    return Number(client.totalPayable) || 0;
  }
  return calcTotalAmount(client?.amountTaken, client?.interestRate);
}

module.exports = {
  calcInterestAmount,
  calcTotalAmount,
  getClientInterestAmount,
  getClientTotalPayable,
};
