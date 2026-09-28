/**
 * Một lần kéo sắp xếp. Giữ thứ tự đồng bộ (không phụ thuộc lúc React render) để khi thả chuột
 * luôn lưu đúng vị trí cuối cùng, kể cả khi kéo-thả rất nhanh.
 */
export class ReorderSession {
  private order: number[];
  private readonly initial: number[];
  private last: { id: number; after: boolean } | null = null;

  constructor(
    ids: number[],
    readonly movingId: number,
  ) {
    this.initial = [...ids];
    this.order = [...ids];
  }

  /**
   * Con trỏ đang ở trên thẻ `targetId`; `after` = con trỏ ở nửa dưới thẻ đó.
   * Chèn trước/sau theo nửa thẻ nên thẻ cao thấp khác nhau không bị lật qua lại.
   */
  over(targetId: number, after: boolean): number[] {
    if (targetId === this.movingId) return this.order;
    const without = this.order.filter((id) => id !== this.movingId);
    const index = without.indexOf(targetId);
    if (index < 0) return this.order;
    without.splice(after ? index + 1 : index, 0, this.movingId);
    this.last = { id: targetId, after };
    this.order = without;
    return this.order;
  }

  /** Thẻ đích cuối cùng — server làm lại đúng phép thả bằng (movingId, target). */
  get target(): { id: number; after: boolean } | null {
    return this.last;
  }

  get current(): number[] {
    return this.order;
  }

  /** Thứ tự cần lưu, hoặc null nếu không đổi so với lúc bắt đầu kéo. */
  finish(): number[] | null {
    return this.order.every((id, i) => id === this.initial[i]) ? null : this.order;
  }
}
