// Bedragen weergeven: 1747 -> "€ 17,47".
export const formatEuro = (cents) => '€ ' + (cents / 100).toFixed(2).replace('.', ',');
