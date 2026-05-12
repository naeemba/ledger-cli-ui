import AccountButtons from './AccountButtons';

const Tree = ({
  tree,
  parentPath = '',
  depth = 0,
}: {
  tree: Record<string, unknown>;
  parentPath?: string;
  depth?: number;
}) => {
  const entries = Object.keys(tree);
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'space-y-1'}>
      {entries.map((key) => {
        const currentPath = `${parentPath}${key}`;
        const children = tree[key] as Record<string, unknown>;
        const hasChildren = Object.keys(children).length > 0;
        return (
          <li key={currentPath}>
            <div className="group flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-subtle">
              <span className="font-medium text-fg">{key}</span>
              <span className="ml-auto">
                <AccountButtons path={currentPath} />
              </span>
            </div>
            {hasChildren && (
              <div className="ml-4 border-l border-border pl-4">
                <Tree
                  tree={children}
                  parentPath={`${currentPath}:`}
                  depth={depth + 1}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default Tree;
