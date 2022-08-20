import Processor from 'windicss'
import config from '../../windi.config'

export const useTailwind = () => {
  return new Processor(config)
}
