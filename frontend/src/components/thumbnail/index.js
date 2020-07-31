import { h } from 'preact';
import style from './style';

const Thumbnail = ({ active, onClick, children }) => (
	<div onClick={onClick} class="inline-block p-4 sm:w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5 rounded-lg">
		<div class={"relative overflow-hidden rounded-lg shadow-xl transition duration-500 ease-in-out " + style.thumbnail + " " + (active ? style.active : "")}>
			{ children }
		</div>
	</div>
);

export default Thumbnail;
