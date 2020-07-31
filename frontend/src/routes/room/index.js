import { h, Component } from 'preact';
import { connect } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';

import RoomController from '../../utils/room';
import getDevice from '../../utils/device';

import Me from '../../components/me';
import Peer from '../../components/peer';

import Thumbnail from '../../components/thumbnail';
import Logo from '../../components/logo';
import Selected from '../../components/selected';
import Notifications from '../../components/notification';
import { Link } from 'preact-router';

const PEER_ID_KEY = "komisia.peerId";
const NAME_KEY = "komisia.name";

class Room extends Component {
	constructor(props) {
		super(props);

		this.state = {
			loading: true,
			name: localStorage.getItem(NAME_KEY) || "Anonymous",
			hasName: !!localStorage.getItem(NAME_KEY),
			selected: null,
			selectedScreen: false
		}

		this.peerId = localStorage.getItem(PEER_ID_KEY) || uuidv4(),
		localStorage.setItem(PEER_ID_KEY, this.peerId);

		const {
			id,
			externalVideo
		} = this.props;

		this.controller = new RoomController({
			roomId: id,
			peerId: this.peerId,
			displayName: this.state.name,
			device: getDevice(),
			handlerName: 'Safari12',
			useSimulcast: true,
			useSharingSimulcast: true,
			forceTcp: false,
			produce: true,
			consume: true,
			forceH264: false,
			forceVP9: false,
			svc: null,
			datachannel: null,
			externalVideo
		});


		this.setName = this.setName.bind(this);
		this.hideSelected = this.hideSelected.bind(this);
	}

	componentDidMount() {
		if (this.state.hasName) {
			this.join();
		}
	}

	componentWillUnmount() {
		this.leave();
	}

	setName(e) {
		const name = e.target.name.value;
		e.preventDefault();

		this.controller._displayName = name;
		localStorage.setItem(NAME_KEY, name);
		this.setState({ hasName: true });
		
		this.join();
	}

	hideSelected() {
		this.setState({ selected: null, selectedScreen: false });
	}

	join() {
		this.controller.join();
	}

	leave() {
		this.controller.close();
	}

	render() {
		let micState;

		if (!this.props.audioProducer)
			micState = 'unsupported';
		else if (!this.props.audioProducer.paused)
			micState = 'on';
		else
			micState = 'off';
		

		let webcamState;

		if (this.props.videoProducer)
			webcamState = 'on';
		else
			webcamState = 'off';
		
		
		if (!this.state.hasName) return (
			<main class="h-full flex items-center">
				<div class="container mx-auto px-8">
					<h1 class="text-4xl tracking-tight leading-10 text-gray-900 sm:text-5xl sm:leading-none md:text-6xl mb-8 md:mb-16"><span class="font-extrabold">Hi there!</span> What should we call you?</h1>
					<form onSubmit={this.setName} class="shadow-lg rounded-lg">
						<input type="text" id="name" name="name" placeholder="Enter your desired name..." class="w-5/6 lg:w-11/12 p-4 rounded-l-lg sm:text-xl outline-none focus:shadow-outline text-base text-grey-darker leading-tight" />
						<input type="submit" value="Join" class="w-1/6 lg:w-1/12 p-4 rounded-r-lg sm:text-xl appearance-none text-base text-white font-bold bg-green-600 leading-tight" />
					</form>
				</div>
			</main>
		);

		return (
			<Fragment>
				<main class="container relative mx-auto mb-32">
					<nav class="h-24 px-8 flex items-center justify-between">
						<h1 class="text-xl sm:text-3xl md:test-4xl">You're in <span class="font-extrabold">#{this.props.id}</span></h1>
						<Logo class="w-32 sm:w-48" />
					</nav>
					{ this.state.selected === this.peerId ?
						(this.state.selectedScreen ?
							<Selected onClose={this.hideSelected}><Me screen /></Selected>
						:	<Selected onClose={this.hideSelected}><Me /></Selected>)
					:(this.state.selected ?
						<Selected onClose={this.hideSelected}><Peer screen={this.state.selectedScreen} id={this.state.selected} /></Selected>
						: null) }
					{ webcamState === 'on' ? <Thumbnail onClick={() => { this.setState({ selected: this.peerId, selectedScreen: false }) }} ><Me /></Thumbnail> : null }
					{this.props.screenProducer ? <Thumbnail onClick={() => { this.setState({ selected: this.peerId, selectedScreen: true }) }} ><Me screen /></Thumbnail> : null}

					{this.props.peers && this.props.peers.filter(e => e.id !== this.state.selected || !this.state.selectedScreen).filter(e => e.consumers.length > 2).map(peer => <Thumbnail onClick={() => { this.setState({ selected: peer.id, selectedScreen: true }) }} ><Peer screen id={peer.id} /></Thumbnail>) }
					{this.props.peers && this.props.peers.filter(e => e.id !== this.state.selected || this.state.selectedScreen).map(peer => <Thumbnail onClick={() => {this.setState({ selected: peer.id, selectedScreen: false })}} active={peer.id === this.props.activeSpeakerId}><Peer id={peer.id} /></Thumbnail>) }
				</main>
				<div class="fixed bottom-0 w-full flex items-center justify-center" style="background: linear-gradient(0deg, rgba(128, 128, 128, 0.35) 0%, rgba(255, 255, 255, 0) 100%);">
					<button onClick={() => {
						if (webcamState === 'on') {
							this.controller.disableWebcam();
						}
						else {
							this.controller.enableWebcam();
						}
					}} class={"w-16 h-16 m-8 rounded-full bg-white text-3xl text-center p-2 transition-shadow duration-500 shadow-lg hover:shadow-2xl " + (webcamState === 'on' ? "" : "bg-gray-800 text-white")}><i class="las la-video-slash"></i></button>
					<button onClick={() => {
						micState === 'on'
						? this.controller.muteMic()
						: this.controller.unmuteMic();
					}} class={"w-16 h-16 m-8 rounded-full bg-white text-3xl text-center p-2 transition-shadow duration-500 shadow-lg hover:shadow-2xl " + (micState === 'on' ? "" : "bg-gray-800 text-white")}><i class="las la-microphone-slash"></i></button>
					<Link href="/" class="w-16 h-16 m-8 rounded-full bg-red-600 text-white text-3xl text-center p-2 transition-shadow duration-500 shadow-lg hover:shadow-2xl"><i class="las la-phone-slash"></i></Link>
					<button onClick={() => this.controller.enableShare()} class="w-16 h-16 m-8 rounded-full bg-white text-3xl text-center p-2 transition-shadow duration-500 shadow-lg hover:shadow-2xl"><i class="las la-desktop"></i></button>
					<button class="w-16 h-16 m-8 rounded-full bg-white text-3xl text-center p-2 transition-shadow duration-500 shadow-lg hover:shadow-2xl"><i class="las la-cog"></i></button>
				</div>
				<div class="fixed bottom-0 right-0">
					<Notifications />
				</div>
			</Fragment>
		);
	}
}

const mapStateToProps = (state) => {
	const producersArray = Object.values(state.producers);
	const audioProducer =
		producersArray.find((producer) => producer.track.kind === 'audio');
	const videoProducer =
		producersArray.filter((producer) => producer.track.kind === 'video');
	
	return {
		room: state.room,
		me: state.me,
		peers: Object.values(state.peers),
		activeSpeakerId: state.room.activeSpeakerId,
		amActiveSpeaker: state.me.id === state.room.activeSpeakerId,
		audioProducer,
		videoProducer: videoProducer[0],
		screenProducer: videoProducer[1]
	};
};

const mapDispatchToProps = (dispatch) => {
	return {
		onRoomLinkCopy: () => {
			dispatch(requestActions.notify(
				{
					text: 'Room link copied to the clipboard'
				}));
		}
	};
};

const connectedRoom = connect(
	mapStateToProps,
	mapDispatchToProps
)(Room);

export default connectedRoom;
