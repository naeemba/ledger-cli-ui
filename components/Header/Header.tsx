import { Navbar, Typography, Button } from '@components/Material';

const Header = () => {
  return (
    <Navbar className="mx-auto max-w-screen-xl px-4 py-2 lg:px-8 lg:py-4">
      <div className="container mx-auto flex items-center justify-between text-blue-gray-900">
        <Typography
          as="a"
          href="#"
          className="mr-4 cursor-pointer py-1.5 font-medium"
        >
          Material Tailwind
        </Typography>
        <div className="flex items-center gap-x-1">
          <div className="mr-4 hidden lg:block">
            <ul className="mt-2 mb-4 flex flex-col gap-2 lg:mb-0 lg:mt-0 lg:flex-row lg:items-center lg:gap-6">
              <Typography
                as="li"
                variant="small"
                color="blue-gray"
                className="p-1 font-normal"
              >
                <a href="#" className="flex items-center">
                  Pages
                </a>
              </Typography>
              <Typography
                as="li"
                variant="small"
                color="blue-gray"
                className="p-1 font-normal"
              >
                <a href="#" className="flex items-center">
                  Account
                </a>
              </Typography>
              <Typography
                as="li"
                variant="small"
                color="blue-gray"
                className="p-1 font-normal"
              >
                <a href="#" className="flex items-center">
                  Blocks
                </a>
              </Typography>
              <Typography
                as="li"
                variant="small"
                color="blue-gray"
                className="p-1 font-normal"
              >
                <a href="#" className="flex items-center">
                  Docs
                </a>
              </Typography>
            </ul>
          </div>

          <Button variant="text" size="sm" className="hidden lg:inline-block">
            <span>Log In</span>
          </Button>
          <Button
            variant="gradient"
            size="sm"
            className="hidden lg:inline-block"
          >
            <span>Sign in</span>
          </Button>
        </div>
      </div>
    </Navbar>
  );
};

export default Header;
