export type TocNode = {
  id: number;
  level: number;
  text: string;
  line: number;
  children: TocNode[];
  expanded: boolean;
};

const fencePattern = new RegExp('^ {0,3}(' + String.fromCharCode(96) + '{3,}|~{3,})(.*)$');

export function parseToc(markdownText: string): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  let fenceChar = '';
  let fenceLength = 0;
  let nextId = 0;

  for (const [lineIndex, line] of markdownText.split('\n').entries()) {
    const marker = fencePattern.exec(line);
    if (fenceChar) {
      if (marker && marker[1][0] === fenceChar && marker[1].length >= fenceLength && /^[ \t]*$/.test(marker[2])) {
        fenceChar = '';
        fenceLength = 0;
      }
      continue;
    }
    if (marker) {
      fenceChar = marker[1][0];
      fenceLength = marker[1].length;
      continue;
    }

    const heading = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
    if (!heading) continue;
    const text = heading[2].replace(/[ \t]+#{2,}[ \t]*$/, '').trim();
    if (!text) continue;
    const node: TocNode = { id: nextId++, level: heading[1].length, text, line: lineIndex, children: [], expanded: true };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

export function flattenToc(nodes: TocNode[]): TocNode[] {
  const result: TocNode[] = [];
  function traverse(list: TocNode[]) {
    for (const node of list) {
      result.push(node);
      traverse(node.children);
    }
  }
  traverse(nodes);
  return result;
}

export function restoreTocExpansion(previous: TocNode[], next: TocNode[]): void {
  const previousState = new Map<string, boolean[]>();
  const occurrences = new Map<string, number>();
  for (const node of flattenToc(previous)) {
    const key = node.level + ':' + node.text;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    if (!previousState.has(key)) previousState.set(key, []);
    previousState.get(key)![occurrence] = node.children.length > 0 ? node.expanded : undefined;
  }

  occurrences.clear();
  for (const node of flattenToc(next)) {
    const key = node.level + ':' + node.text;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    const expanded = previousState.get(key)?.[occurrence];
    if (node.children.length > 0 && expanded !== undefined) node.expanded = expanded;
  }
}
