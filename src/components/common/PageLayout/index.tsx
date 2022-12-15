import { useState, type ReactElement } from 'react'
import classnames from 'classnames'

import Header from '@/components/common//Header'
import css from './styles.module.css'
import SafeLoadingError from '../SafeLoadingError'
import SideDrawer from './SideDrawer'

const PageLayout = ({ children }: { children: ReactElement }): ReactElement => {
  const [isSidebarOpen, setSidebarOpen] = useState<boolean>(true)

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev)
  }

  return (
    <>
      <header className={css.header}>
        <Header onMenuToggle={toggleSidebar} />
      </header>

      <SideDrawer isOpen={isSidebarOpen} onToggle={setSidebarOpen} />

      <div className={classnames(css.main, !isSidebarOpen && css.mainNoSidebar)}>
        <div className={css.content}>
          <SafeLoadingError>{children}</SafeLoadingError>
        </div>
        <img
          src="/images/xrpl_waves.png"
          alt="XRPL waves"
          style={{ position: 'absolute', bottom: 0, right: 0, width: '500px', height: '500px' }}
        />
      </div>
    </>
  )
}

export default PageLayout
