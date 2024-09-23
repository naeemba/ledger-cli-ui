import AccountButtons from './AccountButtons';

const Tree = ({
  tree,
  parentPath = '',
}: {
  tree: Record<string, unknown>;
  parentPath?: string;
}) => {
  return (
    <ul>
      {Object.keys(tree).map((key) => {
        const currentPath = `${parentPath}${key}`;
        return (
          <li key={currentPath} className="pl-16 py-4">
            <span>{key}</span>
            <span className="mx-2" />
            <AccountButtons path={currentPath} />
            {Object.keys(tree[key] as Record<string, unknown>).length > 0 && (
              <Tree
                tree={tree[key] as Record<string, unknown>}
                parentPath={`${currentPath}:`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default Tree;
