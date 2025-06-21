// Mock Canvas API for tests
HTMLCanvasElement.prototype.getContext = function () {
  return {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn()
  };
};

// Mock Image loading
global.Image = class {
  constructor() {
    this.src = '';
  }
};

// Mock performance.now()
global.performance = {
  now: () => Date.now()
};
