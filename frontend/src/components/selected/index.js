import { h } from 'preact';
import style from './style';

const Selected = ({ active, onClose, children }) => (
	<div class={style.selected + " relative max-w-full sm:h-64 m-4 overflow-hidden rounded-lg shadow-xl transition duration-500 ease-in-out"}>
		<div onClick={onClose} class={"absolute top-0 w-8 h-8 m-4 rounded-full text-center " + style.close}>
			<svg version="1.1" x="0px" y="0px" height="16px" width="16px" class="m-2"
				viewBox="0 0 256 256">
				<g>
					<g>
						<polygon points="225.813,48.907 128,146.72 30.187,48.907 0,79.093 128,207.093 256,79.093" fill="#fff" />
					</g>
				</g>
			</svg>
		</div>
		{children}
	</div>
);

export default Selected;
