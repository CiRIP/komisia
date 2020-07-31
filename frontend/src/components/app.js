import { h, Component } from 'preact';
import { Router } from 'preact-router';
import { createStore, applyMiddleware } from 'redux';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';

import reducers from '../redux/reducers';
import RoomClient from '../utils/room';

import Header from './header';

// Code-splitting is automated for routes
import Home from '../routes/home';
import Profile from '../routes/profile';
import Room from '../routes/room';

const store = createStore(
	reducers,
	undefined,
	applyMiddleware(thunk)
);

RoomClient.init(store);

export default class App extends Component {
	
	/** Gets fired when the route changes.
	 *	@param {Object} event		"change" event from [preact-router](http://git.io/preact-router)
	 *	@param {string} event.url	The newly routed URL
	 */
	handleRoute = e => {
		this.currentUrl = e.url;
	};

	render() {
		return (
			<Provider store={store}>
				<div id="app">
					<Router onChange={this.handleRoute}>
						<Home path="/" />
						<Profile path="/profile/" user="me" />
						<Profile path="/profile/:user" />
						<Room path="/room/:id" />
					</Router>
				</div>
			</Provider>
		);
	}
}
