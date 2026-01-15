import SvgIcon, { SvgIconProps } from '@mui/material/SvgIcon';

const KuadrantIcon = (props: SvgIconProps) => (
  <SvgIcon
    {...props}
    viewBox="0 0 1024 1024"
    sx={{ transform: 'scale(0.85)', marginLeft: '4px', ...props.sx }}
  >
    <path
      d="M809,1C993.59,183.56 1065.7,449.65 998.12,699.05C964.778,821.823 899.519,933.607 809,1023L292.27,512L809,1Z"
      fill="currentColor"
    />
    <rect x="1" y="1" width="218" height="1022" fill="currentColor" />
  </SvgIcon>
);

export default KuadrantIcon;
