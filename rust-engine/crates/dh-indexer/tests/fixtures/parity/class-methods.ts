export class Counter {
  value = 0;

  inc(): number {
    this.value = this.value + 1;
    return this.value;
  }
}

const counter = new Counter();
counter.inc();
