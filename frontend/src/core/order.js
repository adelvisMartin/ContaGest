const pad = (n) => String(n).padStart(2, "0");

export const OrderService = {
  order() {
    const d = new Date();
    const date = `${String(d.getFullYear()).slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return `OP-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
  },
  invoice() {
    const d = new Date();
    const date = `${String(d.getFullYear()).slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return `FAC-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
  }
};
