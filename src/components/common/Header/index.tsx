import { type ReactElement } from 'react'
import { useRouter } from 'next/router'
import { IconButton, Paper } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import classnames from 'classnames'
import css from './styles.module.css'
import ChainSwitcher from '@/components/common/ChainSwitcher'
import ConnectWallet from '@/components/common/ConnectWallet'
import NetworkSelector from '@/components/common/NetworkSelector'
import NotificationCenter from '@/components/notification-center/NotificationCenter'
import { AppRoutes } from '@/config/routes'
import Logo from '@/public/images/logo.svg'
import Link from 'next/link'

type HeaderProps = {
  onMenuToggle: () => void
}

const Header = ({ onMenuToggle }: HeaderProps): ReactElement => {
  const router = useRouter()

  // Logo link: if on Dashboard, link to Welcome, otherwise to the root (which redirects to either Dashboard or Welcome)
  const logoHref = router.pathname === AppRoutes.home ? AppRoutes.welcome : AppRoutes.index

  return (
    <Paper className={css.container}>
      <div className={classnames(css.element, css.menuButton)}>
        <IconButton onClick={onMenuToggle} size="large" edge="start" color="default" aria-label="menu">
          <MenuIcon />
        </IconButton>
      </div>

      <div className={classnames(css.element, css.hideMobile, css.logo)}>
        <Link href={logoHref} passHref>
          <a>
            <Logo alt="XRPL logo" />
          </a>
        </Link>
      </div>

      <div className={classnames(css.element, css.hideMobile)}>
        <ChainSwitcher />
      </div>

      <div className={classnames(css.element, css.hideMobile)}>
        <NotificationCenter />
      </div>

      <div className={css.element}>
        <ConnectWallet />
      </div>

      <div className={classnames(css.element, css.networkSelector)}>
        <NetworkSelector />
      </div>
    </Paper>
  )
}

export default Header
