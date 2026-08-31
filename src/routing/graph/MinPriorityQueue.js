/*
 * Binary min-heap used as the search frontier.
 *
 * The smallest priority is removed first. For the initial routing model,
 * priority is arrivalTimeSeconds, which gives Dijkstra-style earliest-
 * arrival ordering. A custom priority function can be supplied later.
 */
class MinPriorityQueue {
    constructor(
        getPriority = state => state.arrivalTimeSeconds
    ) {
        if (typeof getPriority !== "function") {
            throw new TypeError("getPriority must be a function.");
        }

        this.getPriority = getPriority;
        this.heap = [];
        this.nextSequence = 0;
    }

    get size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    peek() {
        return this.heap[0]?.value ?? null;
    }

    enqueue(value) {
        const priority = Number(this.getPriority(value));

        if (!Number.isFinite(priority)) {
            throw new TypeError("Queue priority must be a finite number.");
        }

        const entry = {
            value,
            priority,
            sequence: this.nextSequence++
        };

        this.heap.push(entry);
        this.#bubbleUp(this.heap.length - 1);

        return value;
    }

    dequeue() {
        if (this.heap.length === 0) {
            return null;
        }

        const first = this.heap[0];
        const last = this.heap.pop();

        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.#bubbleDown(0);
        }

        return first.value;
    }

    #comesBefore(first, second) {
        return first.priority < second.priority ||
            (
                first.priority === second.priority &&
                first.sequence < second.sequence
            );
    }

    #bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);

            if (!this.#comesBefore(
                this.heap[index],
                this.heap[parentIndex]
            )) {
                break;
            }

            [this.heap[index], this.heap[parentIndex]] =
                [this.heap[parentIndex], this.heap[index]];

            index = parentIndex;
        }
    }

    #bubbleDown(index) {
        while (true) {
            const leftIndex = index * 2 + 1;
            const rightIndex = leftIndex + 1;
            let smallestIndex = index;

            if (
                leftIndex < this.heap.length &&
                this.#comesBefore(
                    this.heap[leftIndex],
                    this.heap[smallestIndex]
                )
            ) {
                smallestIndex = leftIndex;
            }

            if (
                rightIndex < this.heap.length &&
                this.#comesBefore(
                    this.heap[rightIndex],
                    this.heap[smallestIndex]
                )
            ) {
                smallestIndex = rightIndex;
            }

            if (smallestIndex === index) {
                return;
            }

            [this.heap[index], this.heap[smallestIndex]] =
                [this.heap[smallestIndex], this.heap[index]];

            index = smallestIndex;
        }
    }
}


module.exports = MinPriorityQueue;
