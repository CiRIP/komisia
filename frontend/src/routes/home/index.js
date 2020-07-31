import { h, Component, render } from 'preact';
import style from './style';

import Logo from '../../components/logo';
import { route } from 'preact-router';

export default class Home extends Component {
	constructor(props) {
		super(props);

		this.routeRoom = this.routeRoom.bind(this);
	}

	routeRoom(e) {
		const name = e.target.name.value;
		e.preventDefault();

		route('/room/' + name);
	}

	render() {
		return (
			<div class="relative overflow-hidden h-full">
				<div class="max-w-screen-xl mx-auto h-full">
					<div class="relative z-10 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-xl lg:w-full lg:pb-28 xl:pb-32 h-full">

						<svg class="hidden lg:block absolute left-0 inset-y-0 h-full w-64 text-white transform -translate-x-1/2" style="z-index: -10;" fill="currentColor" viewBox="0 0 100 100" preserveAspectRatio="none">
							<polygon points="50,0 100,0 50,100 0,100" />
						</svg>
						<svg class="hidden lg:block absolute right-0 inset-y-0 h-full w-64 text-white transform translate-x-1/2" fill="currentColor" viewBox="0 0 100 100" preserveAspectRatio="none">
							<polygon points="50,0 100,0 50,100 0,100" />
						</svg>

						<div class="relative pt-6 px-4 sm:px-6 lg:px-8 z-10">
							<Logo class="w-48" />
						</div>

						<main class="mt-10 mx-auto max-w-screen-xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28 z-10">
							<div class="sm:text-center lg:text-left mb-16">
								<h2 class="text-4xl tracking-tight leading-10 font-extrabold text-gray-900 sm:text-5xl sm:leading-none md:text-6xl">
									Dead-simple public
							<br />
									<span class="text-green-600">online conferencing</span>
								</h2>
							</div>
							<form onSubmit={this.routeRoom} class="relative shadow-lg rounded-lg w-100 sm:text-center lg:text-left">
								<input type="text" id="name" name="name" placeholder="Enter room name..." class="w-2/3 lg:1/6 p-4 rounded-l-lg sm:text-xl outline-none focus:shadow-outline text-base text-grey-darker leading-tight" />
								<input type="submit" value="Create/Join" class="w-1/3 lg:5/6 p-4 rounded-r-lg sm:text-xl appearance-none text-base text-white font-bold bg-green-600 leading-tight" />
							</form>
						</main>
					</div>
				</div>
			</div>


		);
	}
}
