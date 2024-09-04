import dayjs from 'dayjs';
import { Navbar, Typography, Button } from '@components/Material';

const Header = () => {
  return (
    <Navbar className="mx-auto px-4 py-2 lg:px-8 lg:py-4 mt-10">
      <div className="container mx-auto flex items-center justify-between text-blue-gray-900">
        <div className="ml-auto flex items-center gap-x-1">
          <div className="mr-4 hidden lg:block">
            <ul className="mt-2 mb-4 flex flex-col gap-2 lg:mb-0 lg:mt-0 lg:flex-row lg:items-center lg:gap-6">
              <Typography
                as="li"
                variant="small"
                color="blue-gray"
                className="p-1 font-normal"
              >
                <a href="/accounts" className="flex items-center">
                  Accounts
                </a>
              </Typography>
              <Typography
                as="li"
                variant="small"
                color="blue-gray"
                className="p-1 font-normal"
              >
                <a href="/balance" className="flex items-center">
                  Balance
                </a>
              </Typography>
              <Typography
                as="li"
                variant="small"
                color="blue-gray"
                className="p-1 font-normal"
              >
                <a
                  href={`/balance/${dayjs().startOf('month').format('YYYY-MM-DD')}/${dayjs().endOf('month').format('YYYY-MM-DD')}`}
                  className="flex items-center"
                >
                  Periodic Balance
                </a>
              </Typography>
            </ul>
          </div>
        </div>
      </div>
    </Navbar>
  );
};

export default Header;
