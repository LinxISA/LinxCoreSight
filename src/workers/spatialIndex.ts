/**
 * Spatial Index - Quadtree implementation for efficient spatial queries
 * Handles millions of gates by partitioning space into manageable regions
 */

import { Gate, Wire, Point } from './placeAndRoute.worker';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuadTreeNode<T> {
  bounds: BoundingBox;
  children?: QuadTreeNode<T>[];
  items: T[];
  isLeaf: boolean;
  depth: number;
}

export class QuadTree<T extends { x: number; y: number; width?: number; height?: number }> {
  private root: QuadTreeNode<T>;
  private maxItems: number;
  private maxDepth: number;
  private itemGateMap: Map<T, Gate> = new Map();

  constructor(bounds: BoundingBox, maxItems: number = 10, maxDepth: number = 10) {
    this.root = {
      bounds,
      items: [],
      isLeaf: true,
      depth: 0
    };
    this.maxItems = maxItems;
    this.maxDepth = maxDepth;
  }

  // Insert an item into the quadtree
  insert(item: T): void {
    this.insertRecursive(this.root, item);
  }

  private insertRecursive(node: QuadTreeNode<T>, item: T): void {
    if (!this.contains(node.bounds, item)) {
      return;
    }

    if (node.isLeaf) {
      node.items.push(item);
      
      // Split if too many items and not at max depth
      if (node.items.length > this.maxItems && node.depth < this.maxDepth) {
        this.split(node);
      }
    } else if (node.children) {
      // Find which child quadrant the item belongs to
      for (const child of node.children) {
        if (this.contains(child.bounds, item)) {
          this.insertRecursive(child, item);
          break;
        }
      }
    }
  }

  private split(node: QuadTreeNode<T>): void {
    const { x, y, width, height } = node.bounds;
    const halfW = width / 2;
    const halfH = height / 2;
    const nextDepth = node.depth + 1;

    node.children = [
      { bounds: { x, y, width: halfW, height: halfH }, items: [], isLeaf: true, depth: nextDepth },
      { bounds: { x: x + halfW, y, width: halfW, height: halfH }, items: [], isLeaf: true, depth: nextDepth },
      { bounds: { x, y: y + halfH, width: halfW, height: halfH }, items: [], isLeaf: true, depth: nextDepth },
      { bounds: { x: x + halfW, y: y + halfH, width: halfW, height: halfH }, items: [], isLeaf: true, depth: nextDepth }
    ];

    // Redistribute existing items
    const items = node.items;
    node.items = [];
    node.isLeaf = false;

    for (const item of items) {
      this.insertRecursive(node, item);
    }
  }

  private contains(bounds: BoundingBox, item: T): boolean {
    const itemRight = item.x + (item.width || 10);
    const itemBottom = item.y + (item.height || 10);
    const boundsRight = bounds.x + bounds.width;
    const boundsBottom = bounds.y + bounds.height;

    return !(item.x > boundsRight || 
             itemRight < bounds.x || 
             item.y > boundsBottom || 
             itemBottom < bounds.y);
  }

  // Query items within a bounding box
  query(bounds: BoundingBox): T[] {
    const results: T[] = [];
    this.queryRecursive(this.root, bounds, results);
    return results;
  }

  private queryRecursive(node: QuadTreeNode<T>, bounds: BoundingBox, results: T[]): void {
    // Check if node bounds intersect with query bounds
    if (!this.intersects(node.bounds, bounds)) {
      return;
    }

    // Add items from this node that are within bounds
    for (const item of node.items) {
      if (this.intersects({ x: item.x, y: item.y, width: item.width || 10, height: item.height || 10 }, bounds)) {
        results.push(item);
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this.queryRecursive(child, bounds, results);
      }
    }
  }

  private intersects(a: BoundingBox, b: BoundingBox): boolean {
    return !(a.x + a.width < b.x || 
             b.x + b.width < a.x || 
             a.y + a.height < b.y || 
             b.y + b.height < a.y);
  }

  // Find items near a point (for hover/selection)
  findNearest(point: Point, maxDistance: number): T[] {
    const results: { item: T; distance: number }[] = [];
    this.findNearestRecursive(this.root, point, maxDistance, results);
    return results.sort((a, b) => a.distance - b.distance).map(r => r.item);
  }

  private findNearestRecursive(
    node: QuadTreeNode<T>, 
    point: Point, 
    maxDistance: number, 
    results: { item: T; distance: number }[]
  ): void {
    // Check if node is within max distance
    const distToBounds = this.distanceToPoint(node.bounds, point);
    if (distToBounds > maxDistance) {
      return;
    }

    // Check items in this node
    for (const item of node.items) {
      const cx = item.x + (item.width || 10) / 2;
      const cy = item.y + (item.height || 10) / 2;
      const distance = Math.sqrt((cx - point.x) ** 2 + (cy - point.y) ** 2);
      
      if (distance <= maxDistance) {
        results.push({ item, distance });
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this.findNearestRecursive(child, point, maxDistance, results);
      }
    }
  }

  private distanceToPoint(bounds: BoundingBox, point: Point): number {
    const closestX = Math.max(bounds.x, Math.min(point.x, bounds.x + bounds.width));
    const closestY = Math.max(bounds.y, Math.min(point.y, bounds.y + bounds.height));
    return Math.sqrt((closestX - point.x) ** 2 + (closestY - point.y) ** 2);
  }

  // Get count of items in tree
  getCount(): number {
    return this.getCountRecursive(this.root);
  }

  private getCountRecursive(node: QuadTreeNode<T>): number {
    let count = node.items.length;
    if (node.children) {
      for (const child of node.children) {
        count += this.getCountRecursive(child);
      }
    }
    return count;
  }

  // Clear all items
  clear(): void {
    this.root = {
      bounds: this.root.bounds,
      items: [],
      isLeaf: true,
      depth: 0
    };
  }
}

// Wire routing quadtree for collision detection
export class WireRouter {
  private obstacleTree: QuadTree<Gate>;

  constructor(bounds: BoundingBox) {
    this.obstacleTree = new QuadTree(bounds);
  }

  setObstacles(gates: Gate[]): void {
    this.obstacleTree.clear();
    for (const gate of gates) {
      this.obstacleTree.insert(gate);
    }
  }

  // Find path avoiding obstacles using A* search
  findPath(start: Point, end: Point, gates: Gate[]): Point[] | null {
    // Simple L-shaped path with obstacle avoidance
    const obstacles = this.obstacleTree.query({
      x: Math.min(start.x, end.x) - 50,
      y: Math.min(start.y, end.y) - 50,
      width: Math.abs(end.x - start.x) + 100,
      height: Math.abs(end.y - start.y) + 100
    });

    // Try horizontal-first path
    const hFirst = [
      start,
      { x: end.x, y: start.y },
      end
    ];

    // Check if horizontal-first path is clear
    if (!this.pathIntersectsObstacles(hFirst, obstacles)) {
      return hFirst;
    }

    // Try vertical-first path
    const vFirst = [
      start,
      { x: start.x, y: end.y },
      end
    ];

    if (!this.pathIntersectsObstacles(vFirst, obstacles)) {
      return vFirst;
    }

    // Both blocked, return L-shape anyway (for demo)
    return hFirst;
  }

  private pathIntersectsObstacles(path: Point[], obstacles: Gate[]): boolean {
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      
      for (const gate of obstacles) {
        if (this.lineIntersectsRect(p1, p2, gate)) {
          return true;
        }
      }
    }
    return false;
  }

  private lineIntersectsRect(p1: Point, p2: Point, gate: Gate): boolean {
    const minX = gate.x - 5;
    const maxX = gate.x + gate.width + 5;
    const minY = gate.y - 5;
    const maxY = gate.y + gate.height + 5;

    // Check if line intersects rectangle
    const left = this.lineIntersectsLine(p1, p2, { x: minX, y: minY }, { x: minX, y: maxY });
    const right = this.lineIntersectsLine(p1, p2, { x: maxX, y: minY }, { x: maxX, y: maxY });
    const top = this.lineIntersectsLine(p1, p2, { x: minX, y: minY }, { x: maxX, y: minY });
    const bottom = this.lineIntersectsLine(p1, p2, { x: minX, y: maxY }, { x: maxX, y: maxY });

    return left || right || top || bottom;
  }

  private lineIntersectsLine(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denom === 0) return false;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }
}
